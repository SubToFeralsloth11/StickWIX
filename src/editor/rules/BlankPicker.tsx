import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { boundKinds, type RuleOwner } from '@/model/references';
import { CONDITIONS, grouped } from '@/model/rule-templates';
import { GAME_PROPS, MATH_FNS, MATH_OPS, PROPS, SETTABLE_PROPS, CURSORS, type Condition, type Num, type Project, type Rule, type Target, type Value } from '@/model/schema';
import { CURSOR_PHRASE, FN_PHRASE, GAME_PROP_PHRASE, MATH_PHRASE, OP_PHRASE, PROP_PHRASE, STICKER_EVENT_PHRASE, VALUE_OP_PHRASE, type BlankKind } from '@/model/sentence';
import { allRules } from '@/model/references';
import { newId, uniqueName } from '@/model/ids';
import type { Library } from '../assets/library';
import { FrameImg } from '../assets/AssetBrowser';
import { KeyPicker } from '../inspector/StickerCard';
import { editorStore } from '../store';
import { getRuleAt } from '../store/rule-ops';

export interface BlankPickerProps {
  project: Project;
  lib: Library;
  rule: Rule;
  owner: RuleOwner;
  path: (string | number)[];
  kind: BlankKind;
  disabled?: boolean;
  /** Sets the blank at `at` (defaults to `path`). */
  onPick: (value: unknown, at?: (string | number)[]) => void;
  children: ReactNode;
  className: string;
}

function Opt({ children, onClick, sub, img }: { children: ReactNode; onClick: () => void; sub?: string; img?: ReactNode }) {
  return (
    <button className="opt" onClick={onClick}>
      {img}
      <span>
        {children}
        {sub && <small>{sub}</small>}
      </span>
    </button>
  );
}

export function BlankPicker(props: BlankPickerProps) {
  const [open, setOpen] = useState(false);
  const pick = (v: unknown, at?: (string | number)[]) => {
    props.onPick(v, at);
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={props.disabled}>
        <button className={props.className} data-blank={props.path.join('.')}>
          {props.children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop" sideOffset={6} align="start" collisionPadding={10}>
          <PickerBody {...props} pick={pick} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PickerBody({ project, lib, rule, owner, path, kind, pick }: BlankPickerProps & { pick: (v: unknown, at?: (string | number)[]) => void }) {
  const inTrigger = path[0] === 'trigger';
  const quant = path[0] === 'actions' && !path.some((k) => k === 'atTarget' || k === 'prop' || k === 'between' || k === 'near' || k === 'to') ? 'every' : 'any';
  const last = path[path.length - 1];
  const current = getRuleAt(rule, path);
  const kinds = project.kinds;
  const scenes = owner.type === 'scene' ? project.scenes.filter((s) => s.id === owner.id) : project.scenes;
  const objectKinds = new Map(project.scenes.flatMap((s) => s.objects.map((o) => [o.id, o.kindId] as const)));

  switch (kind) {
    case 'target': {
      const bound = boundKinds(rule.trigger);
      if (rule.trigger.type === 'touches')
        for (const t of [rule.trigger.a, rule.trigger.b]) if (t.t === 'object' && objectKinds.has(t.id)) bound.add(objectKinds.get(t.id)!);
      const set = (t: Target) => pick(t);
      const placeSwitch = path.includes('atTarget');
      const clickTrigger = inTrigger && rule.trigger.type === 'clicked';
      const uiAllowed =
        (clickTrigger || (!inTrigger && ['show', 'hide', 'destroy', 'changeLook', 'setText'].includes(String(getRuleAt(rule, [...path.slice(0, -1), 'type']))))) &&
        scenes.some((s) => s.ui.some((u) => !clickTrigger || u.type === 'button'));
      return (
        <>
          {owner.type === 'kind' && (
            <>
              <h6>Itself</h6>
              <Opt onClick={() => set({ t: 'self' })} sub={`The ${kinds.find((k) => k.id === owner.id)?.name} this rule belongs to`}>
                this object
              </Opt>
            </>
          )}
          {!inTrigger && bound.size > 0 && (
            <>
              <h6>The one from the "When" part</h6>
              {[...bound].map((kid) => (
                <Opt key={kid} onClick={() => set({ t: 'that', kindId: kid })} sub="Only the one that was involved">
                  that {kinds.find((k) => k.id === kid)?.name ?? '?'}
                </Opt>
              ))}
            </>
          )}
          <h6>{quant === 'every' ? 'Every one of a Kind' : 'Any of a Kind'}</h6>
          {kinds.map((k) => (
            <Opt key={k.id} onClick={() => set({ t: 'any', kindId: k.id })} img={k.lookId && lib.url(k.lookId) ? <FrameImg url={lib.url(k.lookId)!} frames={lib.info(k.lookId)?.frames ?? 1} /> : undefined}>
              {quant} {k.name}
            </Opt>
          ))}
          <h6>One particular object</h6>
          {scenes.flatMap((s) =>
            s.objects.map((o, i) => {
              const k = kinds.find((x) => x.id === o.kindId);
              const same = s.objects.filter((x) => x.kindId === o.kindId).length;
              return (
                <Opt key={o.id} onClick={() => set({ t: 'object', id: o.id })} sub={`${s.name}${same > 1 ? `, at ${Math.round(o.x)}, ${Math.round(o.y)}` : ''}`}>
                  {k?.name ?? 'object'}
                  {same > 1 ? ` #${s.objects.filter((x, j) => x.kindId === o.kindId && j <= i).length}` : ''}
                </Opt>
              );
            }),
          )}
          {uiAllowed && (
            <>
              <h6>On the screen</h6>
              {scenes.flatMap((s) =>
                s.ui
                  .filter((u) => !clickTrigger || u.type === 'button')
                  .map((u) => (
                    <Opt key={u.id} onClick={() => set({ t: 'ui', id: u.id })} sub={`${u.type} on ${s.name}`}>
                      {u.name}
                    </Opt>
                  )),
              )}
            </>
          )}
          {placeSwitch && (
            <>
              <h6>Or</h6>
              <PlaceOptions pick={pick} at={path.slice(0, path.indexOf('atTarget'))} />
            </>
          )}
          {kinds.length === 0 && <div className="muted" style={{ padding: 8 }}>Add some objects to the scene first.</div>}
        </>
      );
    }
    case 'value':
      return <ValueList project={project} rule={rule} owner={owner} onPick={(v) => pick(v)} withNew />;
    case 'number':
    case 'operand': {
      const isLit = current && typeof current === 'object' && 'lit' in current;
      const litVal = isLit ? (current as { lit: unknown }).lit : '';
      const compared = kind === 'operand' ? getRuleAt(rule, [...path.slice(0, -1), 'value']) : undefined;
      const cmpDef = compared && typeof compared === 'object' && 'valueId' in compared ? allValues(project).find((v) => v.id === (compared as { valueId: string }).valueId) : undefined;
      const type = kind === 'number' ? 'number' : (cmpDef?.type ?? 'number');
      const atIdx = path.indexOf('at');
      return (
        <>
          <h6>{type === 'number' ? 'A number' : type === 'text' ? 'Some text' : 'True or false'}</h6>
          {type === 'bool' ? (
            <div className="row" style={{ padding: 6 }}>
              <button className="btn small" onClick={() => pick({ lit: true })}>
                true
              </button>
              <button className="btn small" onClick={() => pick({ lit: false })}>
                false
              </button>
            </div>
          ) : (
            <form
              className="row"
              style={{ padding: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                const raw = String(new FormData(e.currentTarget).get('v') ?? '');
                if (type === 'number') {
                  const n = Number(raw);
                  if (raw.trim() !== '' && Number.isFinite(n)) pick({ lit: n });
                } else pick({ lit: raw });
              }}
            >
              <input className="field grow" name="v" type={type === 'number' ? 'number' : 'text'} step="any" defaultValue={String(litVal)} autoFocus aria-label="Amount" />
              <button className="btn small primary">OK</button>
            </form>
          )}
          <ValueList project={project} rule={rule} owner={owner} onPick={(v) => pick({ ref: v })} filter={(v) => kind === 'operand' || v.type === 'number'} title="Or the amount in a value" />
          {type === 'number' && <Readings current={current as Num | undefined} defaultTarget={defaultTarget(rule, owner)} pick={pick} />}
          {atIdx >= 0 && (
            <>
              <h6>Or a different place</h6>
              <PlaceOptions pick={pick} at={path.slice(0, atIdx)} />
            </>
          )}
        </>
      );
    }
    case 'place':
      return (
        <>
          <h6>Where</h6>
          <PlaceOptions pick={pick} at={path} />
        </>
      );
    case 'message': {
      const names = messageNames(project);
      return (
        <>
          <h6>Messages</h6>
          {names.map((n) => (
            <Opt key={n} onClick={() => pick(n)}>
              {n}
            </Opt>
          ))}
          <form
            className="row"
            style={{ padding: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              const v = String(new FormData(e.currentTarget).get('m') ?? '').trim().slice(0, 40);
              if (v) pick(v);
            }}
          >
            <input className="field grow" name="m" placeholder="New message, e.g. game over" autoFocus maxLength={40} aria-label="Message name" />
            <button className="btn small primary">OK</button>
          </form>
        </>
      );
    }
    case 'anim': {
      const tgt = getRuleAt(rule, [...path.slice(0, -1), 'target']) as Target | undefined;
      const kindId = tgt && (tgt.t === 'any' || tgt.t === 'that') ? tgt.kindId : tgt?.t === 'self' && owner.type === 'kind' ? owner.id : tgt?.t === 'object' ? objectKinds.get(tgt.id) : undefined;
      const pool = kindId ? kinds.filter((k) => k.id === kindId) : kinds;
      const names = [...new Set(pool.flatMap((k) => k.animations.map((a) => a.name)))];
      return (
        <>
          <h6>Animations{kindId ? ` of ${kinds.find((k) => k.id === kindId)?.name}` : ''}</h6>
          {names.map((n) => (
            <Opt key={n} onClick={() => pick(n)}>
              {n}
            </Opt>
          ))}
          {names.length === 0 && <div className="dim" style={{ padding: 8, maxWidth: 260 }}>No animations yet. Select the object and add some in the Animations section of the inspector.</div>}
        </>
      );
    }
    case 'color':
      return <ColorBody current={typeof current === 'string' ? current : '#ffffff'} tintable={String(getRuleAt(rule, [...path.slice(0, -1), 'type'])) === 'tint'} pick={pick} />;
    case 'condition':
      return (
        <>
          <h6>Change the check</h6>
          {grouped(CONDITIONS).map(([g, items]) => (
            <div key={g}>
              <h6>{g}</h6>
              {items.map(([k, t]) => (
                <Opt key={k} onClick={() => pick(t.make() as Condition)} sub={t.help}>
                  {t.label}
                </Opt>
              ))}
            </div>
          ))}
        </>
      );
    case 'key':
      return (
        <div style={{ padding: 6 }} className="stack">
          <span className="muted">Click, then press the key:</span>
          <KeyPicker value={typeof current === 'string' ? current : ''} onChange={(code) => pick(code)} />
        </div>
      );
    case 'kind':
      return (
        <>
          <h6>Kinds</h6>
          {kinds.map((k) => (
            <Opt key={k.id} onClick={() => pick(k.id)} img={k.lookId && lib.url(k.lookId) ? <FrameImg url={lib.url(k.lookId)!} frames={lib.info(k.lookId)?.frames ?? 1} /> : undefined}>
              {k.name}
            </Opt>
          ))}
        </>
      );
    case 'asset':
      return (
        <>
          <h6>Looks</h6>
          {lib.images().filter((i) => i.category !== 'background').map((i) => (
            <Opt key={i.id} onClick={() => pick(i.id)} img={<FrameImg url={i.url} frames={i.frames} />} sub={i.frames > 1 ? `${i.frames} frames` : undefined}>
              {i.name}
            </Opt>
          ))}
        </>
      );
    case 'sound':
      return (
        <>
          <h6>Sounds</h6>
          {lib.sounds().map((s) => (
            <div key={s.id} className="row">
              <button className="btn small ghost" aria-label={`Listen to ${s.name}`} onClick={() => void new Audio(s.url).play().catch(() => {})}>
                ▶
              </button>
              <Opt onClick={() => pick(s.id)} sub={s.category === 'music' ? 'music' : undefined}>
                {s.name}
              </Opt>
            </div>
          ))}
        </>
      );
    case 'scene':
      return (
        <>
          <h6>Scenes</h6>
          {project.scenes.map((s) => (
            <Opt key={s.id} onClick={() => pick(s.id)}>
              {s.name}
            </Opt>
          ))}
        </>
      );
    case 'text':
      return (
        <form
          className="stack"
          style={{ padding: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            pick(String(new FormData(e.currentTarget).get('t') ?? '').slice(0, 200));
          }}
        >
          <input className="field" name="t" defaultValue={typeof current === 'string' ? current : ''} autoFocus maxLength={200} aria-label="Text" />
          <span className="dim" style={{ fontSize: 12 }}>
            Put a value name in curly brackets to show it, like {'{Score}'}.
          </span>
          <button className="btn small primary">OK</button>
        </form>
      );
    case 'choice': {
      const parentType = String(getRuleAt(rule, [...path.slice(0, -1), 'type']));
      const special = choiceOptions(String(last), parentType, path);
      if (special)
        return (
          <>
            {special.map(([v, label], i) => (
              <Opt key={i} onClick={() => (v === UNWRAP ? pick(unwrap(path, rule), path.slice(0, -2)) : v === DROP ? pick(undefined) : pick(v))}>
                {label}
              </Opt>
            ))}
          </>
        );
      const opts: [unknown, string][] =
        last === 'mode'
          ? [['pressed', 'pressed'], ['held', 'held'], ['released', 'released']]
          : last === 'event'
            ? Object.entries(STICKER_EVENT_PHRASE)
            : last === 'op'
              ? path[0] === 'conditions'
                ? Object.entries(OP_PHRASE)
                : Object.entries(VALUE_OP_PHRASE)
              : last === 'direction'
                ? [['up', 'up'], ['down', 'down'], ['left', 'left'], ['right', 'right']]
                : last === 'loop'
                  ? [[true, 'looping'], [false, 'once']]
                  : [];
      return (
        <>
          {opts.map(([v, label]) => (
            <Opt key={String(v)} onClick={() => pick(v)}>
              {label}
            </Opt>
          ))}
        </>
      );
    }
    default:
      return null;
  }
}

function allValues(p: Project): Value[] {
  return [...p.values, ...p.kinds.flatMap((k) => k.values)];
}

/** Game values plus per-object values reachable from this rule ("that Enemy's Health", "this object's Health"). */
function ValueList({ project, rule, owner, onPick, filter = () => true, title = 'Values', withNew }: { project: Project; rule: Rule; owner: RuleOwner; onPick: (v: unknown) => void; filter?: (v: Value) => boolean; title?: string; withNew?: boolean }) {
  const bound = boundKinds(rule.trigger);
  const [naming, setNaming] = useState(false);
  const ownerKind = owner.type === 'kind' ? project.kinds.find((k) => k.id === owner.id) : undefined;
  return (
    <>
      <h6>{title}</h6>
      {project.values.filter(filter).map((v) => (
        <Opt key={v.id} onClick={() => onPick({ valueId: v.id })} sub={`${v.type === 'bool' ? 'true/false' : v.type}, whole game`}>
          {v.name}
        </Opt>
      ))}
      {ownerKind?.values.filter(filter).map((v) => (
        <Opt key={v.id} onClick={() => onPick({ valueId: v.id, of: { t: 'self' } })} sub="this object's own value">
          this object's {v.name}
        </Opt>
      ))}
      {[...bound].flatMap((kid) => {
        const k = project.kinds.find((x) => x.id === kid);
        return (k?.values ?? []).filter(filter).map((v) => (
          <Opt key={kid + v.id} onClick={() => onPick({ valueId: v.id, of: { t: 'that', kindId: kid } })} sub="the one from the When part">
            that {k!.name}'s {v.name}
          </Opt>
        ));
      })}
      {withNew &&
        (naming ? (
          <form
            className="row"
            style={{ padding: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('n') ?? '').trim().slice(0, 30);
              if (!name) return;
              const id = newId('v');
              editorStore.getState().edit(`New value ${name}`, (d) => {
                d.values.push({ id, name: uniqueName(name, d.values.map((x) => x.name), 30), scope: 'game', type: 'number', start: 0, remember: false });
              });
              onPick({ valueId: id });
            }}
          >
            <input className="field grow" name="n" placeholder="e.g. Score" autoFocus maxLength={30} aria-label="New value name" />
            <button className="btn small primary">Make</button>
          </form>
        ) : (
          <Opt onClick={() => setNaming(true)} sub="A number for the whole game, starting at 0">
            ＋ New value…
          </Opt>
        ))}
      {!withNew && project.values.filter(filter).length === 0 && <div className="dim" style={{ padding: '2px 8px 6px' }}>No values yet.</div>}
    </>
  );
}

function ColorBody({ current, tintable, pick }: { current: string; tintable: boolean; pick: (v: unknown) => void }) {
  const [color, setColor] = useState(current);
  return (
    <div className="stack" style={{ padding: 6 }}>
      <div className="swatch-row">
        {['#ffffff', '#ff5d8f', '#ff7a59', '#ffd166', '#5fe0b0', '#7cc4ff', '#b78cff', '#15131c'].map((c) => (
          <button key={c} className="swatch" style={{ background: c }} aria-label={c} onClick={() => pick(c)} />
        ))}
      </div>
      <input type="color" value={color} onChange={(e) => setColor(e.currentTarget.value)} aria-label="Colour" style={{ width: '100%', height: 32 }} />
      <button className="btn small primary" onClick={() => pick(color)}>
        Use this colour
      </button>
      {tintable && (
        <button className="btn small" onClick={() => pick(null)}>
          No colour (normal)
        </button>
      )}
    </div>
  );
}

/** Picked to replace maths with the number it wraps. */
const UNWRAP = Symbol('unwrap');
/** Picked to remove an optional flag (NOT). */
const DROP = Symbol('drop');

function choiceOptions(last: string, parentType: string, path: (string | number)[]): [unknown, string][] | null {
  const parentKey = path[path.length - 2];
  switch (last) {
    case 'not':
      return [[DROP, 'remove NOT (check it normally)']];
    case 'button':
      if (parentType === 'clicked') return [['left', 'is clicked'], ['right', 'is right-clicked']];
      if (parentType === 'holdOn') return [['left', 'left mouse button'], ['right', 'right mouse button']];
      return [['left', 'left mouse button'], ['right', 'right mouse button'], ['middle', 'middle mouse button']];
    case 'mode':
      if (parentType === 'hover') return [['enter', 'onto'], ['leave', 'off']];
      if (parentType === 'fullscreen') return [['on', 'on'], ['off', 'off'], ['toggle', 'switch']];
      if (parentType === 'key') return [['pressed', 'pressed'], ['held', 'held'], ['released', 'released'], ['notHeld', 'not held (any key: no keys held)']];
      return null;
    case 'direction':
      return parentType === 'wheel' ? [['up', 'up'], ['down', 'down']] : null;
    case 'style':
      return CURSORS.map((c) => [c, CURSOR_PHRASE[c]]);
    case 'p':
      return SETTABLE_PROPS.map((x) => [x, PROP_PHRASE[x]]);
    case 'dir':
      return [['left', 'faces left'], ['right', 'faces right'], ['flip', 'turns around']];
    case 'solid':
      return [[true, 'filled'], [false, 'empty']];
    case 'f':
      return parentKey === 'fn' ? [...MATH_FNS.map((x): [unknown, string] => [x, FN_PHRASE[x]]), [UNWRAP, 'no rounding (just the number)']] : null;
    case 'op':
      if (parentKey === 'math') return [...MATH_OPS.map((x): [unknown, string] => [x, x === 'random' ? 'a random number between' : MATH_PHRASE[x]]), [UNWRAP, 'no maths (keep the first number)']];
      return null;
    default:
      return null;
  }
}

/** The number maths wraps: the first number of a sum, or the number inside "rounded (…)". */
function unwrap(path: (string | number)[], rule: Rule): unknown {
  const parent = path.slice(0, -1);
  return getRuleAt(rule, [...parent, path[path.length - 2] === 'fn' ? 'x' : 'a']) ?? { lit: 0 };
}

function PlaceOptions({ pick, at }: { pick: (v: unknown, at?: (string | number)[]) => void; at: (string | number)[] }) {
  return (
    <>
      <Opt onClick={() => pick({ atMouse: { snap: { lit: 0 } } }, at)} sub="Wherever the pointer is">the mouse</Opt>
      <Opt onClick={() => pick({ atMouse: { snap: { lit: 32 } } }, at)} sub="Lines up with a grid, for building with blocks">the mouse, snapped to a grid</Opt>
      <Opt onClick={() => pick({ atTarget: { t: 'unset' } }, at)}>where an object is…</Opt>
      <Opt onClick={() => pick({ near: { target: { t: 'unset' }, dx: { lit: 32 }, dy: { lit: 0 } } }, at)} sub="An object's position plus a few pixels">next to an object…</Opt>
      <Opt onClick={() => pick({ at: { x: { lit: 0 }, y: { lit: 0 } } }, at)}>a spot (x, y)…</Opt>
    </>
  );
}

/** "this object" in Kind rules, else the Kind the trigger is about, else a blank to fill in. */
function defaultTarget(rule: Rule, owner: RuleOwner): Target {
  if (owner.type === 'kind') return { t: 'self' };
  const bound = [...boundKinds(rule.trigger)];
  return bound[0] ? { t: 'that', kindId: bound[0] } : { t: 'unset' };
}

/** Live readings, object properties and maths for a number blank. */
function Readings({ current, defaultTarget: def, pick }: { current: Num | undefined; defaultTarget: Target; pick: (v: unknown) => void }) {
  const of = current && 'prop' in current ? current.prop.of : def;
  const inner: Num = current && !('unset' in current) ? current : { lit: 0 };
  return (
    <>
      <details className="pick-more">
        <summary>The mouse, time and camera</summary>
        {GAME_PROPS.map((g) => (
          <Opt key={g} onClick={() => pick({ game: g })}>
            the {GAME_PROP_PHRASE[g]}
          </Opt>
        ))}
      </details>
      <details className="pick-more">
        <summary>Something about an object</summary>
        {PROPS.map((x) => (
          <Opt key={x} onClick={() => pick({ prop: { of, p: x } })}>
            its {PROP_PHRASE[x]}
          </Opt>
        ))}
        <Opt onClick={() => pick({ between: { a: def, b: { t: 'unset' }, f: 'distance' } })}>the distance between two objects</Opt>
        <Opt onClick={() => pick({ between: { a: def, b: { t: 'unset' }, f: 'angle' } })}>the angle from one object to another</Opt>
        <Opt onClick={() => pick({ tile: { place: { atMouse: { snap: { lit: 0 } } } } })} sub="-1 when there is no tile">the tile number at a place</Opt>
      </details>
      <details className="pick-more">
        <summary>Maths and random</summary>
        <Opt onClick={() => pick({ math: { op: 'random', a: { lit: 1 }, b: { lit: 6 } } })} sub="Like rolling a dice">a random number</Opt>
        <Opt onClick={() => pick({ math: { op: 'add', a: inner, b: { lit: 1 } } })} sub="+ − × ÷, smallest, biggest, power">do maths with this number</Opt>
        <Opt onClick={() => pick({ fn: { f: 'round', x: inner } })} sub="Round, round down, without minus, square root, sine…">round or change this number</Opt>
      </details>
    </>
  );
}

/** Every message name used by "send" actions and "message" triggers. */
function messageNames(p: Project): string[] {
  const out = new Set<string>();
  for (const { rule } of allRules(p)) {
    if (rule.trigger.type === 'message' && typeof rule.trigger.name === 'string') out.add(rule.trigger.name);
    for (const a of rule.actions) if (a.type === 'sendMessage' && typeof a.name === 'string') out.add(a.name);
  }
  return [...out].sort();
}
