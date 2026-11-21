import type { Action, Condition, GameProp, MathFn, MathOp, Num, Operand, Place, Project, Prop, Rule, StickerEvent, Target, Trigger, ValueRef } from './schema';
import { existingIds, ruleBlanks, type Blank } from './references';

/** What sort of picker a blank opens in the editor. */
export type BlankKind =
  | 'target' | 'value' | 'number' | 'operand' | 'key' | 'kind' | 'asset' | 'sound' | 'scene' | 'text' | 'choice' | 'place' | 'point'
  | 'message' | 'anim' | 'color' | 'condition';

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
  broken: 'is broken',
  spawns: 'spawns something',
};

export const PROP_PHRASE: Record<Prop, string> = {
  x: 'x', y: 'y', centerX: 'middle x', centerY: 'middle y', speedX: 'sideways speed', speedY: 'up-down speed', rotation: 'turn (degrees)',
  width: 'width', height: 'height', size: 'size %', opacity: 'see-through %', frame: 'frame', layer: 'layer',
  distanceToMouse: 'distance to the mouse', angleToMouse: 'angle to the mouse', facing: 'facing (-1 left, 1 right)',
};

export const GAME_PROP_PHRASE: Record<GameProp, string> = {
  mouseX: 'mouse x', mouseY: 'mouse y', screenMouseX: 'mouse x on screen', screenMouseY: 'mouse y on screen',
  mouseMoveX: 'mouse movement x', mouseMoveY: 'mouse movement y', holdTime: 'seconds the mouse is held', time: 'seconds in this scene',
  totalTime: 'seconds since the game began', cameraX: 'camera x', cameraY: 'camera y', zoom: 'camera zoom %', sceneWidth: 'scene width',
  sceneHeight: 'scene height', screenWidth: 'screen width', screenHeight: 'screen height', objectCount: 'number of objects', wheel: 'mouse wheel turns',
};

export const MATH_PHRASE: Record<MathOp, string> = {
  add: '+', sub: '−', mul: '×', div: '÷', mod: 'remainder after dividing by', min: 'or (whichever is smaller)', max: 'or (whichever is bigger)', pow: 'to the power of', random: 'random from',
};

export const FN_PHRASE: Record<MathFn, string> = {
  round: 'rounded', floor: 'rounded down', ceil: 'rounded up', abs: 'without minus', sqrt: 'square root of', sin: 'sine of', cos: 'cosine of', negate: 'minus',
};

export const CURSOR_PHRASE = { default: 'the normal arrow', none: 'hidden', crosshair: 'a crosshair', pointer: 'a pointing hand', grab: 'a grabbing hand', look: 'its own picture' } as const;

export const OP_PHRASE = { eq: 'is', ne: 'is not', lt: 'is less than', le: 'is at most', gt: 'is more than', ge: 'is at least' } as const;
export const VALUE_OP_PHRASE = { add: 'goes up by', subtract: 'goes down by', set: 'becomes' } as const;

const UNSET_TEXT: Record<BlankKind, string> = {
  target: 'something', value: 'a value', number: 'a number', operand: 'an amount', key: 'a key', kind: 'a Kind',
  asset: 'a look', sound: 'a sound', scene: 'a scene', text: 'some text', choice: '…', place: 'somewhere', point: 'x, y',
  message: 'a message', anim: 'an animation', color: 'a colour', condition: 'a check',
};

/** Friendly name of a KeyboardEvent.code ("KeyA" → "A", "ArrowUp" → "Up"). */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Numpad ' + code.slice(6);
  if (code === 'AnyKey') return 'any key';
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
        const quant = path[0] === 'actions' && !path.some((k) => k === 'atTarget' || k === 'prop' || k === 'between' || k === 'near' || k === 'to') ? 'every' : 'any';
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
  const num = (n: Num, path: (string | number)[]): void => {
    if ('unset' in n) return blank('number', path, undefined, true);
    if ('lit' in n) return blank('number', path, String(n.lit));
    if ('ref' in n) {
      ownerOf(n.ref, path);
      return blank('number', path, values.get(n.ref.valueId) ?? missing);
    }
    numExtra(n, path, 'number');
  };
  /** Live readings and maths, shared by number and amount blanks. The reading's name opens the full number picker. */
  const numExtra = (n: Exclude<Num, { lit: number } | { ref: ValueRef } | { unset: true }>, path: (string | number)[], kind: BlankKind) => {
    if ('prop' in n) {
      target(n.prop.of, [...path, 'prop', 'of']);
      word("'s");
      blank(kind, path, PROP_PHRASE[n.prop.p]);
    } else if ('game' in n) blank(kind, path, `the ${GAME_PROP_PHRASE[n.game]}`);
    else if ('math' in n) {
      word('(');
      if (n.math.op === 'random') {
        blank('choice', [...path, 'math', 'op'], 'a random number from');
        num(n.math.a, [...path, 'math', 'a']);
        word('to');
        num(n.math.b, [...path, 'math', 'b']);
      } else {
        num(n.math.a, [...path, 'math', 'a']);
        blank('choice', [...path, 'math', 'op'], MATH_PHRASE[n.math.op]);
        num(n.math.b, [...path, 'math', 'b']);
      }
      word(')');
    } else if ('fn' in n) {
      blank('choice', [...path, 'fn', 'f'], FN_PHRASE[n.fn.f]);
      word('(');
      num(n.fn.x, [...path, 'fn', 'x']);
      word(')');
    } else if ('between' in n) {
      blank(kind, path, n.between.f === 'distance' ? 'the distance from' : 'the angle from');
      target(n.between.a, [...path, 'between', 'a']);
      word('to');
      target(n.between.b, [...path, 'between', 'b']);
    } else if ('tile' in n) {
      blank(kind, path, 'the tile number at');
      place(n.tile.place, [...path, 'tile', 'place']);
    }
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
    if ('ref' in o) {
      ownerOf(o.ref, path);
      return blank('operand', path, values.get(o.ref.valueId) ?? missing);
    }
    numExtra(o, path, 'operand');
  };
  const ref = (kind: BlankKind, id: string | { unset: true }, path: (string | number)[], name: (id: string) => string | undefined) =>
    typeof id === 'string' ? blank(kind, path, name(id) ?? missing) : blank(kind, path, undefined, true);
  const text = (kind: BlankKind, v: string | { unset: true }, path: (string | number)[], quote = true) =>
    typeof v === 'string' ? blank(kind, path, quote ? `"${v}"` : v) : blank(kind, path, undefined, true);
  const assetName = (id: string) => assets.get(id) ?? names.asset?.(id) ?? (id.startsWith('builtin:') ? builtinName(id) : undefined);
  const place = (pl: Place, path: (string | number)[]): void => {
    if ('at' in pl) {
      num(pl.at.x, [...path, 'at', 'x']);
      word(',');
      num(pl.at.y, [...path, 'at', 'y']);
    } else if ('atTarget' in pl) {
      target(pl.atTarget, [...path, 'atTarget']);
      word("'s position");
    } else if ('atMouse' in pl) {
      blank('place', path, 'the mouse');
      if (!('lit' in pl.atMouse.snap && pl.atMouse.snap.lit === 0)) {
        word('on a');
        num(pl.atMouse.snap, [...path, 'atMouse', 'snap']);
        word('px grid');
      }
    } else {
      target(pl.near.target, [...path, 'near', 'target']);
      blank('place', path, "'s position moved by");
      num(pl.near.dx, [...path, 'near', 'dx']);
      word(',');
      num(pl.near.dy, [...path, 'near', 'dy']);
    }
  };
  const seconds = (n: Num, path: (string | number)[]) => {
    num(n, path);
    word('lit' in n && n.lit === 1 ? 'second' : 'seconds');
  };
  const key = (k: string | { unset: true }, path: (string | number)[]) =>
    typeof k === 'string' ? blank('key', path, keyName(k)) : blank('key', path, undefined, true);
  const button = (b: string | undefined, path: (string | number)[]) => blank('choice', path, `${b ?? 'left'} mouse button`);

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
        key(t.key, [...P, 'key']);
        word('is');
        blank('choice', [...P, 'mode'], t.mode === 'notHeld' ? (t.key === 'AnyKey' ? 'not held (no keys)' : 'not held') : t.mode);
        break;
      case 'clicked': target(t.target, [...P, 'target']); blank('choice', [...P, 'button'], t.button === 'right' ? 'is right-clicked' : 'is clicked'); break;
      case 'touches': target(t.a, [...P, 'a']); word('touches'); target(t.b, [...P, 'b']); break;
      case 'valueChanges': valueRef(t.value, [...P, 'value']); word('changes'); break;
      case 'valueReaches': valueRef(t.value, [...P, 'value']); word('reaches'); num(t.amount, [...P, 'amount']); break;
      case 'created': target(t.target, [...P, 'target']); word('is created'); break;
      case 'destroyed': target(t.target, [...P, 'target']); word('is destroyed'); break;
      case 'leavesScene': target(t.target, [...P, 'target']); word('leaves the scene'); break;
      case 'sticker': target(t.target, [...P, 'target']); blank('choice', [...P, 'event'], STICKER_EVENT_PHRASE[t.event]); break;
      case 'holdOn':
        target(t.target, [...P, 'target']); word('is held down with the'); button(t.button, [...P, 'button']); word('for'); seconds(t.seconds, [...P, 'seconds']);
        break;
      case 'mouse': word('the'); button(t.button, [...P, 'button']); word('is'); blank('choice', [...P, 'mode'], t.mode); break;
      case 'wheel': word('the mouse wheel turns'); blank('choice', [...P, 'direction'], t.direction); break;
      case 'hover': word('the mouse moves'); blank('choice', [...P, 'mode'], t.mode === 'enter' ? 'onto' : 'off'); target(t.target, [...P, 'target']); break;
      case 'letGo': target(t.target, [...P, 'target']); word('is let go after a click'); break;
      case 'everyFrame': word('a frame passes (60 times a second)'); break;
      case 'message': word('the message'); text('message', t.name, [...P, 'name']); word('is sent'); break;
      case 'stopsTouching': target(t.a, [...P, 'a']); word('stops touching'); target(t.b, [...P, 'b']); break;
      case 'animEnds': target(t.target, [...P, 'target']); word('finishes its animation'); break;
      case 'becomes': blank('condition', [...P, 'cond'], 'it becomes true that'); condition(t.cond, [...P, 'cond']); break;
      case 'whileTrue': blank('condition', [...P, 'cond'], 'a frame passes while'); condition(t.cond, [...P, 'cond']); break;
    }
  };

  const condition = (c: Condition, P: (string | number)[]) => {
    if (c.not) blank('choice', [...P, 'not'], 'NOT');
    switch (c.type) {
      case 'compare': valueRef(c.value, [...P, 'value']); blank('choice', [...P, 'op'], OP_PHRASE[c.op]); operand(c.to, [...P, 'to']); break;
      case 'count':
        word('there are'); blank('choice', [...P, 'op'], OP_PHRASE[c.op].replace(/^is ?/, '') || 'exactly');
        num(c.amount, [...P, 'amount']); ref('kind', c.kindId, [...P, 'kindId'], (id) => kinds.get(id)); word('left');
        break;
      case 'keyHeld': key(c.key, [...P, 'key']); word('is held'); break;
      case 'touching': target(c.a, [...P, 'a']); word('is touching'); target(c.b, [...P, 'b']); break;
      case 'chance': word('a'); num(c.percent, [...P, 'percent']); word('% chance hits'); break;
      case 'numCompare': num(c.a, [...P, 'a']); blank('choice', [...P, 'op'], OP_PHRASE[c.op]); num(c.b, [...P, 'b']); break;
      case 'mouseDown': word('the'); button(c.button, [...P, 'button']); word('is held'); break;
      case 'mouseOver': word('the mouse is over'); target(c.target, [...P, 'target']); break;
      case 'onGround': target(c.target, [...P, 'target']); word('is on the ground'); break;
      case 'visible': target(c.target, [...P, 'target']); word('can be seen'); break;
      case 'exists': target(c.target, [...P, 'target']); word('is in the scene'); break;
      case 'distance':
        word('the distance from'); target(c.a, [...P, 'a']); word('to'); target(c.b, [...P, 'b']);
        blank('choice', [...P, 'op'], OP_PHRASE[c.op]); num(c.amount, [...P, 'amount']);
        break;
      case 'playing': target(c.target, [...P, 'target']); word('is playing'); text('anim', c.anim, [...P, 'anim'], false); break;
      case 'tileAt': word('the tile at'); place(c.place, [...P, 'place']); word('is'); blank('choice', [...P, 'solid'], c.solid ? 'solid' : 'empty'); break;
      case 'cursorLocked': word('the mouse pointer is locked'); break;
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
        target(a.target, [...P, 'target']); word('plays the frames of'); ref('asset', a.assetId, [...P, 'assetId'], assetName);
        word('at'); num(a.fps, [...P, 'fps']); word('fps'); blank('choice', [...P, 'loop'], a.loop ? 'looping' : 'once');
        break;
      case 'changeValue': valueRef(a.value, [...P, 'value']); blank('choice', [...P, 'op'], VALUE_OP_PHRASE[a.op]); operand(a.amount, [...P, 'amount']); break;
      case 'showText': word('show'); blank('text', [...P, 'text'], `"${a.text}"`, a.text === ''); word('for'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'playSound': word('play sound'); ref('sound', a.assetId, [...P, 'assetId'], assetName); break;
      case 'wait': word('wait'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'waitDone': word('wait for the steps above to finish'); break;
      case 'waitUntil': blank('condition', [...P, 'cond'], 'wait until'); condition(a.cond, [...P, 'cond']); break;
      case 'together': word('at the same time'); break;
      case 'changeScene': word('go to scene'); ref('scene', a.sceneId, [...P, 'sceneId'], (id) => scenes.get(id)); break;
      case 'restartScene': word('restart this scene'); break;
      case 'shakeCamera': word('shake the screen for'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'share': word('share'); blank('text', [...P, 'text'], `"${a.text}"`, a.text === ''); break;
      case 'playAnim': target(a.target, [...P, 'target']); word('plays its'); text('anim', a.anim, [...P, 'anim'], false); word('animation'); break;
      case 'stopAnim': target(a.target, [...P, 'target']); word('stops animating'); break;
      case 'setFrame': target(a.target, [...P, 'target']); word('shows frame'); num(a.frame, [...P, 'frame']); break;
      case 'setProp':
        target(a.target, [...P, 'target']); word("'s"); blank('choice', [...P, 'p'], PROP_PHRASE[a.p]);
        blank('choice', [...P, 'op'], VALUE_OP_PHRASE[a.op]); num(a.amount, [...P, 'amount']);
        break;
      case 'turn': target(a.target, [...P, 'target']); word('turns by'); num(a.degrees, [...P, 'degrees']); word('degrees'); break;
      case 'pointTowards': target(a.target, [...P, 'target']); word('points towards'); place(a.to, [...P, 'to']); break;
      case 'face': target(a.target, [...P, 'target']); blank('choice', [...P, 'dir'], a.dir === 'flip' ? 'turns around' : `faces ${a.dir}`); break;
      case 'tint':
        target(a.target, [...P, 'target']); word('is tinted');
        blank('color', [...P, 'color'], a.color ?? 'no colour (normal)');
        break;
      case 'glide': target(a.target, [...P, 'target']); word('glides to'); place(a.to, [...P, 'to']); word('in'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'headTowards': target(a.target, [...P, 'target']); word('heads towards'); place(a.to, [...P, 'to']); word('at speed'); num(a.speed, [...P, 'speed']); break;
      case 'say': target(a.target, [...P, 'target']); word('says'); blank('text', [...P, 'text'], `"${a.text}"`, a.text === ''); word('for'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'clone': word('make a copy of'); target(a.target, [...P, 'target']); break;
      case 'sendMessage': word('send the message'); text('message', a.name, [...P, 'name']); break;
      case 'lockCursor': word('lock the mouse pointer'); break;
      case 'unlockCursor': word('unlock the mouse pointer'); break;
      case 'setCursor': word('the mouse pointer becomes'); blank('choice', [...P, 'style'], CURSOR_PHRASE[a.style]); break;
      case 'cursorLook': word('the mouse pointer looks like'); ref('asset', a.assetId, [...P, 'assetId'], assetName); break;
      case 'playMusic': word('play music'); ref('sound', a.assetId, [...P, 'assetId'], assetName); break;
      case 'stopMusic': word('stop the music'); break;
      case 'stopSounds': word('stop all sounds'); break;
      case 'setVolume': word('set the volume to'); num(a.percent, [...P, 'percent']); word('%'); break;
      case 'zoomCamera': word('zoom the camera to'); num(a.percent, [...P, 'percent']); word('%'); break;
      case 'cameraFollow': word('the camera follows'); target(a.target, [...P, 'target']); break;
      case 'cameraMoveTo': word('the camera moves to'); place(a.to, [...P, 'to']); break;
      case 'flashScreen': word('flash the screen'); blank('color', [...P, 'color'], a.color); word('for'); seconds(a.seconds, [...P, 'seconds']); break;
      case 'burst': word('burst'); num(a.count, [...P, 'count']); blank('color', [...P, 'color'], a.color); word('sparks at'); place(a.place, [...P, 'place']); break;
      case 'fullscreen': word('full screen'); blank('choice', [...P, 'mode'], a.mode); break;
      case 'timeScale': word('the game runs at'); num(a.percent, [...P, 'percent']); word('% speed'); break;
      case 'setText': target(a.target, [...P, 'target']); word('text becomes'); blank('text', [...P, 'text'], `"${a.text}"`, a.text === ''); break;
      case 'setTile': word('the tile at'); place(a.place, [...P, 'place']); word('becomes tile'); num(a.tile, [...P, 'tile']); break;
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
    else if (/^[,.%)]|^'s|^, /.test(t) || s.endsWith('(')) s += t;
    else s += ' ' + t;
  }
  return s.replace(/ ,/g, ',');
}

export function sentenceText(rule: Rule, p: Project, names?: NameLookup): string {
  return joinSegments(ruleSegments(rule, p, names));
}
