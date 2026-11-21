import type { MouseButton, Sticker, StickerEvent } from '../model/schema';
import type { StickerType } from '../model/sticker-settings';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A live object during Play. Position is the top-left corner of its box in scene pixels. */
export interface Instance {
  id: string;
  /** Placed object id from the document, or null when spawned during Play. */
  objectId: string | null;
  kindId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hitbox relative to (x, y). */
  hit: Box;
  vx: number;
  vy: number;
  rotation: number;
  layer: number;
  hidden: boolean;
  lookId: string | null;
  /** Playing animation; `name` is set for a Kind's named animation; `done` once a non-looping one ended. */
  anim: { assetId: string | null; fps: number; loop: boolean; t: number; frame: number; name?: string; done?: boolean } | null;
  /** With no animation playing: show this frame instead of flipping through frames on their own. */
  still: number | null;
  /** Size of the Kind (before any resize), so "size %" is relative to it. */
  base: { w: number; h: number; hit: Box };
  /** Base see-through (Kind opacity / rules), multiplied with `alpha`. */
  opacity: number;
  tint: string | null;
  /** Clicks and hovering pass through it. */
  ignoreMouse: boolean;
  /** Rule "glide": slides from (fx, fy) to (tx, ty) over `dur` seconds. */
  glide: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null;
  /** Speech bubble ("say"). `until` is scene time. */
  say: { text: string; until: number } | null;
  /** Breaking progress 0..1 (Breakable), drawn as cracks. */
  crack: number;
  /** Health bar above the object, when shown. */
  bar: { v: number; max: number } | null;
  grounded: boolean;
  /** -1 left, 1 right; last horizontal direction faced. */
  facing: number;
  /** Last movement direction for top-down / shooters (unit vector). */
  dir: { x: number; y: number };
  values: Map<string, number | string | boolean>;
  stickers: LiveSticker[];
  /** True when a sticker moved it this step (gets collision resolution against solids). */
  body: boolean;
  dead: boolean;
  /** Seconds left of invincibility after being hurt (Health). */
  invincible: number;
  /** Draw alpha 0..1 (Health flash, fades). */
  alpha: number;
  /** Visual scale multiplier (Clickable hover grow). */
  pop: number;
  /** Projectile spawned by Shooter: removed when it hits something solid. */
  projectile: boolean;
  /** Instance id of the Shooter that fired this projectile; its Hurts never hits that shooter. */
  firedBy: string | null;
  /** Bounciness applied by physics when blocked (Bouncy sticker); 0 = none. */
  bounce: number;
  /** Seconds during which controllers ignore input (knockback). */
  stun: number;
  /** Result of the last physics move. */
  blocked: { left: boolean; right: boolean; up: boolean; down: boolean };
  /** Set by the Solid sticker: blocks bodies (one-way blocks only from above). */
  solid: 'none' | 'solid' | 'oneWay';
  /** Held by the mouse (Draggable): physics and gravity leave it alone. */
  dragged: boolean;
}

export interface LiveSticker {
  id: string;
  type: StickerType;
  settings: Record<string, unknown>;
  state: Record<string, unknown>;
}

/** Everything a rule can be triggered by; also feeds the Show-me ring buffer. */
export type RuntimeEvent =
  | { type: 'sceneStart' }
  | { type: 'timer'; ruleId: string; seconds: number }
  | { type: 'key'; key: string; mode: 'pressed' | 'held' | 'released' }
  /** Once per step when a rule listens for "key is not held"; carries what is held. */
  | { type: 'keyUp'; held: ReadonlySet<string> }
  | { type: 'clicked'; id: string; ui?: boolean; button?: 'right' }
  | { type: 'touch'; a: string; b: string }
  | { type: 'valueChanged'; valueId: string; objectId?: string; from: unknown; to: unknown }
  | { type: 'created'; id: string }
  | { type: 'destroyed'; id: string }
  | { type: 'leavesScene'; id: string }
  | { type: 'sticker'; id: string; event: StickerEvent }
  | { type: 'holding'; id: string; button: 'left' | 'right'; from: number; to: number }
  | { type: 'mouse'; button: MouseButton; mode: 'pressed' | 'held' | 'released' }
  | { type: 'wheel'; direction: 'up' | 'down' }
  | { type: 'hover'; id: string; mode: 'enter' | 'leave' }
  | { type: 'letGo'; id: string }
  | { type: 'frame' }
  | { type: 'message'; name: string }
  | { type: 'untouch'; a: string; b: string }
  | { type: 'animEnd'; id: string };

export type Diagnostic =
  | { type: 'runaway'; ruleId: string }
  | { type: 'objectCap'; sceneId: string; kindId: string }
  | { type: 'error'; ruleId: string; message: string };

export interface InputState {
  /** Physical key codes (KeyboardEvent.code) currently held. */
  held: Set<string>;
  /** Went down / up since the previous step. */
  pressed: Set<string>;
  released: Set<string>;
  /** Left button in down/pressed/released; every button in the sets below. */
  mouse: { x: number; y: number; down: boolean; pressed: boolean; released: boolean };
  buttons: { held: Set<MouseButton>; pressed: Set<MouseButton>; released: Set<MouseButton> };
  /** Wheel notches this step (up positive). */
  wheel: number;
  /** Mouse movement this step in game pixels (works while the pointer is locked). */
  move: { x: number; y: number };
}

export interface WorldApi {
  all(): Iterable<Instance>;
  get(id: string): Instance | undefined;
  byKind(kindId: string): Instance[];
  /** `prep` runs before "is created" fires (copies, projectiles). */
  spawn(kindId: string, x: number, y: number, prep?: (inst: Instance) => void): Instance | null;
  destroy(inst: Instance): void;
  /** Solid at a world point (tiles or Solid objects). */
  solidAt(x: number, y: number, ignore?: Instance): boolean;
  overlaps(a: Instance, b: Instance): boolean;
  /** Mouse position in scene coordinates. */
  mouseWorld(): { x: number; y: number };
  playSound(assetId: string | null): void;
  /** The Kinds that hold a controller sticker (default target for Collectible/Hurts/Chase). */
  controllerKindIds(): string[];
  /** Topmost visible instance under a scene point. */
  topmostAt(x: number, y: number): Instance | undefined;
  /** Tile grid cell size (snap size for Draggable). */
  cellSize(): number;
  sceneSize(): { w: number; h: number };
  /** Throws little sparks out of a scene point. */
  burst(x: number, y: number, color: string, count: number): void;
  /** Wants the pointer drawn as a hand / hidden this step (Clickable, Follow Mouse). */
  cursorHint(hint: 'pointer' | 'none'): void;
  /** Named animation of the instance's Kind (case-insensitive); false when it has none by that name. */
  playAnim(inst: Instance, name: string): boolean;
}

export interface StepCtx {
  dt: number;
  input: InputState;
  world: WorldApi;
  emit(event: RuntimeEvent): void;
  rng: () => number;
}

/** Behaviour module for one sticker type (contracts/sticker-module.md). */
export interface StickerModule {
  type: StickerType;
  category: 'controller' | 'physics' | 'gameplay' | 'input' | 'visual';
  label: string;
  help: string;
  icon: string;
  fields: SettingField[];
  events?: { id: StickerEvent; phrase: string }[];
  init?(inst: Instance, s: Record<string, unknown>, state: Record<string, unknown>, ctx: StepCtx): void;
  step?(inst: Instance, s: Record<string, unknown>, state: Record<string, unknown>, ctx: StepCtx): void;
  onContact?(inst: Instance, other: Instance, s: Record<string, unknown>, state: Record<string, unknown>, ctx: StepCtx): void;
}

export type SettingField =
  | { key: string; kind: 'slider'; label: string; help: string; min: number; max: number; step: number; unit?: string }
  | { key: string; kind: 'toggle'; label: string; help: string }
  | { key: string; kind: 'choice'; label: string; help: string; options: { value: string | number; label: string }[] }
  | { key: string; kind: 'kind'; label: string; help: string; emptyLabel: string }
  | { key: string; kind: 'look'; label: string; help: string }
  | { key: string; kind: 'sound'; label: string; help: string }
  | { key: string; kind: 'key'; label: string; help: string }
  | { key: string; kind: 'anim'; label: string; help: string };

export type { Sticker };
