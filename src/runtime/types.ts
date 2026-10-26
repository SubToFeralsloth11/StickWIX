import type { Sticker, StickerEvent } from '../model/schema';
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
  anim: { assetId: string | null; fps: number; loop: boolean; t: number; frame: number } | null;
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
  | { type: 'clicked'; id: string; ui?: boolean }
  | { type: 'touch'; a: string; b: string }
  | { type: 'valueChanged'; valueId: string; objectId?: string; from: unknown; to: unknown }
  | { type: 'created'; id: string }
  | { type: 'destroyed'; id: string }
  | { type: 'leavesScene'; id: string }
  | { type: 'sticker'; id: string; event: StickerEvent };

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
  mouse: { x: number; y: number; down: boolean; pressed: boolean; released: boolean };
}

export interface WorldApi {
  all(): Iterable<Instance>;
  get(id: string): Instance | undefined;
  byKind(kindId: string): Instance[];
  spawn(kindId: string, x: number, y: number): Instance | null;
  destroy(inst: Instance): void;
  /** Solid at a world point (tiles or Solid objects). */
  solidAt(x: number, y: number, ignore?: Instance): boolean;
  overlaps(a: Instance, b: Instance): boolean;
  /** Mouse position in scene coordinates. */
  mouseWorld(): { x: number; y: number };
  playSound(assetId: string | null): void;
  /** The Kind that holds a controller sticker (default target for Collectible/Hurts/Chase). */
  controllerKindIds(): string[];
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
  | { key: string; kind: 'key'; label: string; help: string };

export type { Sticker };
