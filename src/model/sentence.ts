import type { Action, Condition, Num, Operand, Place, Project, Rule, StickerEvent, Target, Trigger, ValueRef } from './schema';
import { existingIds, ruleBlanks, type Blank } from './references';

/** What sort of picker a blank opens in the editor. */
export type BlankKind = 'target' | 'value' | 'number' | 'operand' | 'key' | 'kind' | 'asset' | 'sound' | 'scene' | 'text' | 'choice' | 'place' | 'point';

/** Which part of the rule a segment belongs to (the editor groups parts for remove buttons). */
export type Part = { kind: 'trigger' } | { kind: 'condition' | 'action'; index: number };

export type Segment = ({ text: string } | { blank: BlankKind; path: (string | number)[]; text: string; status: 'ok' | 'unset' | 'broken' }) & {
  part?: Part;
};

export const STICKER_EVENT_PHRASE: Record<StickerEvent, string> = {
  collected: 'is collected',
  outOfHealth: 'runs out of health',
  hurt: 'is hurt',
  dropped: 'is dropped',
  shoots: 'shoots',
  jumps: 'jumps',
  lands: 'lands',
};

export const OP_PHRASE = { eq: 'is', ne: 'is not', lt: 'is less than', le: 'is at most', gt: 'is more than', ge: 'is at least' } as const;
export const VALUE_OP_PHRASE = { add: 'goes up by', subtract: 'goes down by', set: 'becomes' } as const;

const UNSET_TEXT: Record<BlankKind, string> = {
  target: 'something', value: 'a value', number: 'a number', operand: 'an amount', key: 'a key', kind: 'a Kind',
  asset: 'a look', sound: 'a sound', scene: 'a scene', text: 'some text', choice: '…', place: 'somewhere', point: 'x, y',
};

/** Friendly name of a KeyboardEvent.code ("KeyA" → "A", "ArrowUp" → "Up"). */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Numpad ' + code.slice(6);
  return { Space: 'Space', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', Escape: 'Esc' }[code] ?? code;
}

/** Fallback display name for a builtin asset key: "builtin:sfx/coin_big" → "Coin big". */
export function builtinName(key: string): string {
  const base = key.split('/').pop() ?? key;
  const s = base.replace(/[_-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface NameLookup {
  /** Display name for an asset id, builtin or project. */
  asset?: (id: string) => string | undefined;
}

/**
 * Turns a rule into sentence segments: plain words and blanks (FR-015).
 * The editor renders blanks as picker chips; `sentenceText` joins them.
 */
export function ruleSegments(rule: Rule, p: Project, names: NameLookup = {}): Segment[] {
  const kinds = new Map(p.kinds.map((k) => [k.id, k.name]));
  const objects = new Map(p.scenes.flatMap((s) => s.objects.map((o) => [o.id, kinds.get(o.kindId) ?? 'object'] as const)));
  const ui = new Map(p.scenes.flatMap((s) => s.ui.map((u) => [u.id, u.name] as const)));
  const values = new Map([...p.values, ...p.kinds.flatMap((k) => k.values)].map((v) => [v.id, v.name]));
  const scenes = new Map(p.scenes.map((s) => [s.id, s.name]));
  const assets = new Map(p.assets.map((a) => [a.id, a.name]));
  const blanks = ruleBlanks(rule, existingIds(p), new Map(p.scenes.flatMap((s) => s.objects.map((o) => [o.id, o.kindId] as const))));

  const out: Segment[] = [];
  let part: Part | undefined;
  const word = (t: string) => out.push({ text: t, part });
  const statusAt = (path: (string | number)[]): 'ok' | 'unset' | 'broken' => {
    const key = path.join('.');
    const hit = blanks.find((b: Blank) => b.path.join('.') === key || b.path.join('.').startsWith(key + '.'));
    return hit ? (hit.problem === 'unset' ? 'unset' : 'broken') : 'ok';
  };
  const blank = (kind: BlankKind, path: (string | number)[], text: string | undefined, forceUnset = false) => {
    const status = forceUnset ? 'unset' : statusAt(path);
    out.push({ blank: kind, path, text: status === 'unset' ? UNSET_TEXT[kind] : (text ?? 'missing'), status, part });
  };
  const missing = '(deleted)';
  const kindName = (id: string) => kinds.get(id) ?? missing;

  const target = (t: Target, path: (string | number)[]) => {
    switch (t.t) {
      case 'object': return blank('target', path, objects.get(t.id) ?? missing);
      case 'any': {
        // In actions "any" acts on every object of the Kind (place targets use the first one); conditions check any.
        const quant = path[0] === 'actions' && !path.includes('atTarget') ? 'every' : 'any';
        return blank('target', path, `${quant} ${kindName(t.kindId)}`);
      }
      case 'that': return blank('target', path, `that ${kindName(t.kindId)}`);
      case 'self': return blank('target', path, 'this object');
      case 'ui': return blank('target', path, ui.get(t.id) ?? missing);
      case 'unset': return blank('target', path, undefined, true);
    }
  };
  const valueRef = (v: ValueRef | { unset: true }, path: (string | number)[]) => {
    if ('unset' in v) return blank('value', path, undefined, true);
    if (v.of) {
      target(v.of, [...path, 'of']);
      word("'s");
    }
    blank('value', path, values.get(v.valueId) ?? missing);
  };
  const num = (n: Num, path: (string | number)[]) => {
    if ('unset' in n) return blank('number', path, undefined, true);
    if ('lit' in n) return blank('number', path, String(n.lit));
    ownerOf(n.ref, path);
    blank('number', path, values.get(n.ref.valueId) ?? missing);
  };
  /** "that Coin's" / "this object's" before a per-object value used as an amount. */
  const ownerOf = (r: ValueRef, path: (string | number)[]) => {
    if (!r.of) return;
    target(r.of, [...path, 'ref', 'of']);
    word("'s");
  };
  const operand = (o: Operand, path: (string | number)[]) => {
    if ('unset' in o) return blank('operand', path, undefined, true);
    if ('lit' in o) return blank('operand', path, typeof o.lit === 'string' ? `"${o.lit}"` : String(o.lit));
    ownerOf(o.ref, path);
    blank('operand', path, values.get(o.ref.valueId) ?? missing);
  };
  const ref = (kind: BlankKind, id: string | { unset: true }, path: (string | number)[], name: (id: string) => string | undefined) =>
    typeof id === 'string' ? blank(kind, path, name(id) ?? missing) : blank(kind, path, undefined, true);
  const assetName = (id: string) => assets.get(id) ?? names.asset?.(id) ?? (id.startsWith('builtin:') ? builtinName(id) : undefined);
  const place = (pl: Place, path: (string | number)[]) => {
    if ('at' in pl) {
      num(pl.at.x, [...path, 'at', 'x']);
      word(',');
      num(pl.at.y, [...path, 'at', 'y']);
    } else {
      target(pl.atTarget, [...path, 'atTarget']);
      word("'s position");
    }
  };
  const seconds = (n: Num, path: (string | number)[]) => {
    num(n, path);
    word('lit' in n && n.lit === 1 ? 'second' : 'seconds');
  };

  const trigger = (t: Trigger) => {
    const P = ['trigger'];
    word('When');
    switch (t.type) {
      case 'sceneStart': word('the scene starts'); break;
      case 'every': word('every'); seconds(t.seconds, [...P, 'seconds']); word('pass'); break;
      case 'after':
        seconds(t.seconds, [...P, 'seconds']);
        word('lit' in t.seconds && t.seconds.lit === 1 ? 'has passed' : 'have passed');
        break;
      case 'key':
        if (typeof t.key === 'string') blank('key', [...P, 'key'], keyName(t.key));
        else blank('key', [...P, 'key'], undefined, true);
        word('is');
        blank('choice', [...P, 'mode'], t.mode);
        break;
      case 'clicked': target(t.target, [...P, 'target']); word('is clicked'); break;
      case 'touches': target(t.a, [...P, 'a']); word('touches'); target(t.b, [...P, 'b']); break;
      case 'valueChanges': valueRef(t.value, [...P, 'value']); word('changes'); break;
      case 'valueReaches': valueRef(t.value, [...P, 'value']); word('reaches'); num(t.amount, [...P, 'amount']); break;
      case 'created': target(t.target, [...P, 'target']); word('is created'); break;
      case 'destroyed': target(t.target, [...P, 'target']); word('is destroyed'); break;
      case 'leavesScene': target(t.target, [...P, 'target']); word('leaves the scene'); break;
      case 'sticker': target(t.target, [...P, 'target']); blank('choice', [...P, 'event'], STICKER_EVENT_PHRASE[t.event]); break;
    }
  };

  const condition = (c: Condition, P: (string | number)[]) => {
    switch (c.type) {
      case 'compare': valueRef(c.value, [...P, 'value']); blank('choice', [...P, 'op'], OP_PHRASE[c.op]); operand(c.to, [...P, 'to']); break;
      case 'count':
        word('there are'); blank('choice', [...P, 'op'], OP_PHRASE[c.op].replace(/^is ?/, '') || 'exactly');
        num(c.amount, [...P, 'amount']); ref('kind', c.kindId, [...P, 'kindId'], (id) => kinds.get(id)); word('left');
        break;
      case 'keyHeld':
        if (typeof c.key === 'string') blank('key', [...P, 'key'], keyName(c.key));
        else blank('key', [...P, 'key'], undefined, true);
        word('is held');
        break;
      case 'touching': target(c.a, [...P, 'a']); word('is touching'); target(c.b, [...P, 'b']); break;
      case 'chance': word('a'); num(c.percent, [...P, 'percent']); word('% chance hits'); break;
    }
  };

  const action = (a: Action, P: (string | number)[]) => {
    switch (a.type) {
      case 'moveTo': target(a.target, [...P, 'target']); word('moves to'); place(a.to, [...P, 'to']); break;
      case 'moveBy':
        target(a.target, [...P, 'target']); word('moves by'); num(a.by.x, [...P, 'by', 'x']); word(','); num(a.by.y, [...P, 'by', 'y']);
        break;
      case 'setSpeed':
        target(a.target, [...P, 'target']); word("'s speed becomes"); num(a.speed.x, [...P, 'speed', 'x']); word(','); num(a.speed.y, [...P, 'speed', 'y']);
        break;
      case 'push':
        target(a.target, [...P, 'target']); word('is pushed'); blank('choice', [...P, 'direction'], a.direction);
        word('with strength'); num(a.strength, [...P, 'strength']);
        break;
      case 'create': word('create a'); ref('kind', a.kindId, [...P, 'kindId'], (id) => kinds.get(id)); word('at'); place(a.place, [...P, 'place']); break;
      case 'destroy': target(a.target, [...P, 'target']); word('disappears'); break;
      case 'show': target(a.target, [...P, 'target']); word('appears'); break;
      case 'hide': target(a.target, [...P, 'target']); word('hides'); break;
      case 'changeLook': target(a.target, [...P, 'target']); word('looks like'); ref('asset', a.assetId, [...P, 'assetId'], assetName); break;
      case 'animate':
        target(a.target, [...P, 'target']); word('plays animation'); ref('asset', a.assetId, [...P, 'assetId'], assetName);
        word('at'); num(a.fps, [...P, 'fps']); word('fps'); blank('choice', [...P, 'loop'], a.loop ? 'looping' : 'once');
        break;
      case 'changeValue': valueRef(a.value, [...P, 'value']); blank('choice', [...P, 'op'], VALUE_OP_PHRASE[a.op]); operand(a.amount, [...P, 'amount']); break;
      case 'showText': word('show'); blank('text', [...P, 'text'], `"${a.text}"`, a.text === ''); word('for'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'playSound': word('play sound'); ref('sound', a.assetId, [...P, 'assetId'], assetName); break;
      case 'wait': word('wait'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'changeScene': word('go to scene'); ref('scene', a.sceneId, [...P, 'sceneId'], (id) => scenes.get(id)); break;
      case 'restartScene': word('restart this scene'); break;
      case 'shakeCamera': word('shake the screen for'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'share': word('share'); blank('text', [...P, 'text'], `"${a.text}"`, a.text === ''); break;
    }
  };

  part = { kind: 'trigger' };
  trigger(rule.trigger);
  part = undefined;
  rule.conditions.items.forEach((c, i) => {
    part = undefined;
    word(i === 0 ? ', only if' : rule.conditions.join === 'all' ? 'and' : 'or');
    part = { kind: 'condition', index: i };
    condition(c, ['conditions', 'items', i]);
  });
  part = undefined;
  word('→');
  rule.actions.forEach((a, i) => {
    part = undefined;
    if (i > 0) word(i === rule.actions.length - 1 ? (rule.actions.length > 2 ? ', and' : 'and') : ',');
    part = { kind: 'action', index: i };
    action(a, ['actions', i]);
  });
  part = undefined;
  word('.');
  return out;
}

/** Joins segments into one readable sentence with sensible spacing around punctuation. */
export function joinSegments(segs: Segment[]): string {
  let s = '';
  for (const seg of segs) {
    const t = seg.text;
    if (!s) s = t;
    else if (/^[,.%]|^'s|^, /.test(t)) s += t;
    else s += ' ' + t;
  }
  return s.replace(/ ,/g, ',');
}

export function sentenceText(rule: Rule, p: Project, names?: NameLookup): string {
  return joinSegments(ruleSegments(rule, p, names));
}
