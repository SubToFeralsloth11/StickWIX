import type { CursorStyle, GameProp, Num, Operand, Place, Prop, SettableProp, Target, ValueRef } from '../../model/schema';
import type { Camera } from '../camera';
import type { UILayer } from '../ui-layer';
import type { Values, Scalar } from '../values';
import type { World } from '../world';
import type { Diagnostic, Instance, InputState } from '../types';

/** What the rule engine needs from the running game. */
export interface RuleHost {
  world: World;
  values: Values;
  camera: Camera;
  ui: UILayer;
  input: InputState;
  rng: () => number;
  time: number;
  playSound(assetId: string | null): void;
  showText(text: string, seconds: number): void;
  /** Hands a message to the system share menu (or clipboard); in the editor it is just shown. */
  share(text: string): void;
  /** Scene change happens at the end of the step; remaining actions stop. */
  requestScene(sceneId: string | null): void;
  readonly sceneChanging: boolean;
  /** Notes a timer firing for the Show-me event list. */
  recordTimer(ruleId: string, seconds: number): void;
  diagnostic(d: Diagnostic): void;
  /** Live game readings for number blanks (mouse, time, camera...). */
  gameProp(p: GameProp): number;
  /** Sends a message: every "When the message ... is sent" rule runs now. */
  message(name: string): void;
  music(assetId: string | null): void;
  stopSounds(): void;
  setVolume(v: number): void;
  setCursor(style: CursorStyle): void;
  setCursorLook(assetId: string): void;
  lockPointer(lock: boolean): void;
  pointerLocked(): boolean;
  fullscreen(mode: 'on' | 'off' | 'toggle'): void;
  flash(color: string, seconds: number): void;
  /** Object the camera follows; null = none (stays where it is). */
  follow(id: string | null): void;
  timeScale: number;
}

/** Instances a trigger bound: "this object", "that [Kind]", and every object the event was about. */
export interface Binding {
  self?: string;
  that: Map<string, string>;
  /** Instance ids the trigger matched (a Kind-owned rule binds "this object" to the one of its Kind). */
  subjects?: string[];
}

export const emptyBinding = (): Binding => ({ that: new Map() });

/** Instances a target refers to right now (actions/conditions side). */
export function resolveTarget(t: Target, b: Binding, host: RuleHost): Instance[] {
  const w = host.world;
  switch (t.t) {
    case 'object': {
      const i = w.get(t.id);
      return i ? [i] : [];
    }
    case 'any':
      return w.byKind(t.kindId);
    case 'that': {
      const id = b.that.get(t.kindId);
      const i = id ? w.get(id) : undefined;
      return i ? [i] : [];
    }
    case 'self': {
      const i = b.self ? w.get(b.self) : undefined;
      return i ? [i] : [];
    }
    case 'ui':
    case 'unset':
      return [];
  }
}

/** The instance whose per-object value a ValueRef reads (defaults to "this object", then the only bound one). */
export function valueOwner(ref: ValueRef, b: Binding, host: RuleHost): Instance | undefined {
  if (!host.values.isObjectValue(ref.valueId)) return undefined;
  if (ref.of) return resolveTarget(ref.of, b, host)[0];
  if (b.self) return host.world.get(b.self);
  const kindId = [...host.world.kinds.values()].find((k) => k.values.some((v) => v.id === ref.valueId))?.id;
  const bound = kindId ? b.that.get(kindId) : undefined;
  return bound ? host.world.get(bound) : undefined;
}

export function readValue(ref: ValueRef, b: Binding, host: RuleHost): Scalar | undefined {
  return host.values.get(ref.valueId, valueOwner(ref, b, host));
}

export const centerOf = (i: Instance) => ({ x: i.x + i.w / 2, y: i.y + i.h / 2 });
const DEG = 180 / Math.PI;

/** A live property of an object. */
export function propOf(i: Instance, p: Prop, host: RuleHost): number {
  switch (p) {
    case 'x': return i.x;
    case 'y': return i.y;
    case 'centerX': return i.x + i.w / 2;
    case 'centerY': return i.y + i.h / 2;
    case 'speedX': return i.vx;
    case 'speedY': return i.vy;
    case 'rotation': return i.rotation;
    case 'width': return i.w;
    case 'height': return i.h;
    case 'size': return (i.w / i.base.w) * 100;
    case 'opacity': return Math.round((1 - i.opacity) * 100);
    case 'frame': return i.anim ? i.anim.frame : (i.still ?? 0);
    case 'layer': return i.layer;
    case 'facing': return i.facing;
    case 'distanceToMouse':
    case 'angleToMouse': {
      const c = centerOf(i);
      const m = host.world.mouseWorld();
      return p === 'distanceToMouse' ? Math.hypot(m.x - c.x, m.y - c.y) : Math.atan2(m.y - c.y, m.x - c.x) * DEG;
    }
  }
}

/** Changes a property; sizes keep the object centred. */
export function setPropOf(i: Instance, p: SettableProp, v: number) {
  switch (p) {
    case 'x': i.x = v; break;
    case 'y': i.y = v; break;
    case 'speedX':
      i.vx = v;
      if (v) i.body ||= i.solid === 'none';
      break;
    case 'speedY':
      i.vy = v;
      if (v) i.body ||= i.solid === 'none';
      break;
    case 'rotation': i.rotation = ((v % 360) + 360) % 360; break;
    case 'width':
    case 'height':
    case 'size': {
      const rx = p === 'height' ? i.w / i.base.w : Math.max(0.01, (p === 'size' ? v / 100 : v / i.base.w));
      const ry = p === 'width' ? i.h / i.base.h : Math.max(0.01, (p === 'size' ? v / 100 : v / i.base.h));
      const c = centerOf(i);
      i.w = i.base.w * rx;
      i.h = i.base.h * ry;
      i.hit = { x: i.base.hit.x * rx, y: i.base.hit.y * ry, w: i.base.hit.w * rx, h: i.base.hit.h * ry };
      i.x = c.x - i.w / 2;
      i.y = c.y - i.h / 2;
      break;
    }
    case 'opacity': i.opacity = Math.min(1, Math.max(0, 1 - v / 100)); break;
    case 'frame':
      i.anim = null;
      i.still = Math.max(0, Math.floor(v));
      break;
    case 'layer': i.layer = Math.round(v); break;
  }
}

/**
 * Where a Place points, as the top-left for an object of size w×h (w = h = 0
 * gives the point itself). The mouse can snap to a grid: then the top-left
 * sits on the grid cell under the mouse.
 */
export function placeAt(p: Place, w: number, h: number, b: Binding, host: RuleHost): { x: number; y: number } | null {
  if ('at' in p) {
    const x = evalNum(p.at.x, b, host);
    const y = evalNum(p.at.y, b, host);
    return x === null || y === null ? null : { x, y };
  }
  if ('atTarget' in p) {
    const t = resolveTarget(p.atTarget, b, host)[0];
    return t ? { x: t.x + t.w / 2 - w / 2, y: t.y + t.h / 2 - h / 2 } : null;
  }
  if ('atMouse' in p) {
    const m = host.world.mouseWorld();
    const snap = evalNum(p.atMouse.snap, b, host) ?? 0;
    if (snap > 0) return { x: Math.floor(m.x / snap) * snap, y: Math.floor(m.y / snap) * snap };
    return { x: m.x - w / 2, y: m.y - h / 2 };
  }
  const t = resolveTarget(p.near.target, b, host)[0];
  const dx = evalNum(p.near.dx, b, host);
  const dy = evalNum(p.near.dy, b, host);
  if (!t || dx === null || dy === null) return null;
  return { x: t.x + t.w / 2 + dx - w / 2, y: t.y + t.h / 2 + dy - h / 2 };
}

/** The point a Place names (centre of objects, the mouse, a grid cell corner). */
export const placePoint = (p: Place, b: Binding, host: RuleHost) => placeAt(p, 0, 0, b, host);

function math(op: string, a: number, b: number, host: RuleHost): number {
  switch (op) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': return b === 0 ? 0 : a / b;
    case 'mod': return b === 0 ? 0 : ((a % b) + b) % b;
    case 'min': return Math.min(a, b);
    case 'max': return Math.max(a, b);
    case 'pow': return Math.pow(a, b);
    default: {
      // random: a whole number when both ends are whole, otherwise any number between.
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(host.rng() * (hi - lo + 1));
      return lo + host.rng() * (hi - lo);
    }
  }
}

function fn(f: string, x: number): number {
  switch (f) {
    case 'round': return Math.round(x);
    case 'floor': return Math.floor(x);
    case 'ceil': return Math.ceil(x);
    case 'abs': return Math.abs(x);
    case 'sqrt': return x < 0 ? 0 : Math.sqrt(x);
    case 'sin': return Math.sin(x / DEG);
    case 'cos': return Math.cos(x / DEG);
    default: return -x;
  }
}

type Reading = Exclude<Num, { lit: number } | { ref: ValueRef } | { unset: true }>;

function evalReading(n: Reading, b: Binding, host: RuleHost): number | null {
  if ('prop' in n) {
    const i = resolveTarget(n.prop.of, b, host)[0];
    return i ? propOf(i, n.prop.p, host) : null;
  }
  if ('game' in n) return host.gameProp(n.game);
  if ('math' in n) {
    const x = evalNum(n.math.a, b, host);
    const y = evalNum(n.math.b, b, host);
    if (x === null || y === null) return null;
    const r = math(n.math.op, x, y, host);
    return Number.isFinite(r) ? r : null;
  }
  if ('fn' in n) {
    const x = evalNum(n.fn.x, b, host);
    return x === null ? null : fn(n.fn.f, x);
  }
  if ('between' in n) {
    const a = resolveTarget(n.between.a, b, host)[0];
    const c = resolveTarget(n.between.b, b, host)[0];
    if (!a || !c) return null;
    const p = centerOf(a);
    const q = centerOf(c);
    return n.between.f === 'distance' ? Math.hypot(q.x - p.x, q.y - p.y) : Math.atan2(q.y - p.y, q.x - p.x) * DEG;
  }
  const pt = placePoint(n.tile.place, b, host);
  return pt ? host.world.tileAtPoint(pt.x, pt.y) : null;
}

/** A number blank's current amount, or null if unset/unreadable. */
export function evalNum(n: Num, b: Binding, host: RuleHost): number | null {
  if ('lit' in n) return n.lit;
  if ('ref' in n) {
    const v = readValue(n.ref, b, host);
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) ? x : null;
  }
  if ('unset' in n) return null;
  return evalReading(n, b, host);
}

export function evalOperand(o: Operand, b: Binding, host: RuleHost): Scalar | null {
  if ('lit' in o) return o.lit;
  if ('ref' in o) return readValue(o.ref, b, host) ?? null;
  if ('unset' in o) return null;
  return evalReading(o, b, host);
}
