import { z } from 'zod';

/**
 * Settings schema for every sticker type. Every field has a default, so a
 * sticker parsed from `{}` works with zero configuration (FR-013).
 * Lives in model/ (not runtime/) so the document schema can validate settings
 * without importing runtime code; runtime sticker modules reuse these schemas.
 */

const assetRef = z.string().nullable();
const kindRef = z.string().nullable();
export const MovementKeys = z.enum(['both', 'arrows', 'wasd']);

export const StickerSettings = {
  platformer: z.object({
    speed: z.number().min(20).max(800).default(180),
    jumpHeight: z.number().min(0).max(400).default(72),
    gravity: z.number().min(100).max(5000).default(1400),
    airControl: z.number().min(0).max(1).default(0.8),
    coyoteMs: z.number().min(0).max(500).default(100),
    jumpBufferMs: z.number().min(0).max(500).default(100),
    extraJumps: z.number().int().min(0).max(5).default(0),
    keys: MovementKeys.default('both'),
    idleLook: assetRef.default(null),
    walkLook: assetRef.default(null),
    jumpLook: assetRef.default(null),
  }),
  topdown: z.object({
    speed: z.number().min(20).max(800).default(160),
    directions: z.union([z.literal(4), z.literal(8)]).default(8),
    keys: MovementKeys.default('both'),
    faceMovement: z.boolean().default(true),
    walkLook: assetRef.default(null),
  }),
  solid: z.object({
    oneWay: z.boolean().default(false),
  }),
  falls: z.object({
    gravity: z.number().min(100).max(5000).default(1400),
    maxFall: z.number().min(50).max(3000).default(900),
  }),
  bouncy: z.object({
    bounce: z.number().min(0).max(1.2).default(0.8),
  }),
  collectible: z.object({
    collectedBy: kindRef.default(null),
    sound: assetRef.default('builtin:sfx/coin'),
    disappear: z.boolean().default(true),
  }),
  hurts: z.object({
    damage: z.number().min(0).max(100).default(1),
    knockback: z.number().min(0).max(1000).default(200),
    target: kindRef.default(null),
  }),
  health: z.object({
    max: z.number().int().min(1).max(100).default(3),
    invincibleMs: z.number().min(0).max(5000).default(1000),
    flash: z.boolean().default(true),
    showBar: z.boolean().default(false),
  }),
  patrol: z.object({
    distance: z.number().min(0).max(2000).default(96),
    speed: z.number().min(5).max(600).default(60),
    axis: z.enum(['x', 'y']).default('x'),
    turnAtEdges: z.boolean().default(true),
  }),
  chase: z.object({
    target: kindRef.default(null),
    speed: z.number().min(5).max(600).default(90),
    range: z.number().min(0).max(3000).default(200),
  }),
  shooter: z.object({
    fireWith: z.enum(['key', 'click']).default('key'),
    key: z.string().default('KeyX'),
    projectile: kindRef.default(null),
    speed: z.number().min(20).max(2000).default(400),
    cooldownMs: z.number().min(0).max(5000).default(300),
    aim: z.enum(['facing', 'mouse']).default('facing'),
    auto: z.boolean().default(false),
    count: z.number().int().min(1).max(12).default(1),
    spread: z.number().min(0).max(180).default(15),
  }),
  clickable: z.object({
    hoverGrow: z.boolean().default(true),
    sound: assetRef.default('builtin:sfx/click'),
    pointer: z.boolean().default(true),
  }),
  draggable: z.object({
    snapToGrid: z.boolean().default(false),
  }),
  cameraFollow: z.object({
    smoothing: z.number().min(0).max(1).default(0.15),
    deadzone: z.number().min(0).max(400).default(32),
    clampToScene: z.boolean().default(true),
  }),
  animate: z.object({
    lookId: assetRef.default(null),
    fps: z.number().min(1).max(60).default(8),
    loop: z.boolean().default(true),
  }),
  breakable: z.object({
    seconds: z.number().min(0.05).max(30).default(1),
    button: z.enum(['left', 'right']).default('left'),
    reach: z.number().min(0).max(3000).default(0),
    drop: kindRef.default(null),
    sound: assetRef.default('builtin:sfx/break'),
    cracks: z.boolean().default(true),
  }),
  followMouse: z.object({
    smoothing: z.number().min(0).max(1).default(0),
    snap: z.number().int().min(0).max(256).default(0),
    hideCursor: z.boolean().default(false),
  }),
  wander: z.object({
    speed: z.number().min(5).max(600).default(50),
    changeEvery: z.number().min(0.2).max(20).default(2),
    axis: z.enum(['x', 'both']).default('x'),
  }),
  spin: z.object({
    speed: z.number().min(-1440).max(1440).default(90),
  }),
  lifetime: z.object({
    seconds: z.number().min(0.05).max(120).default(2),
    fade: z.boolean().default(true),
  }),
  pointAt: z.object({
    target: kindRef.default(null),
    offset: z.number().min(-180).max(180).default(0),
  }),
  wrap: z.object({
    axis: z.enum(['x', 'y', 'both']).default('both'),
  }),
  stayInScene: z.object({}),
  float: z.object({
    height: z.number().min(1).max(200).default(8),
    speed: z.number().min(0.1).max(10).default(1),
  }),
  spawner: z.object({
    kind: kindRef.default(null),
    every: z.number().min(0.1).max(60).default(2),
    max: z.number().int().min(1).max(200).default(10),
    spread: z.number().min(0).max(1000).default(0),
  }),
  animator: z.object({
    idle: z.string().default(''),
    walk: z.string().default(''),
    jump: z.string().default(''),
    fall: z.string().default(''),
  }),
} as const;

export type StickerType = keyof typeof StickerSettings;
export const STICKER_TYPES = Object.keys(StickerSettings) as StickerType[];
export type StickerSettingsOf<T extends StickerType> = z.infer<(typeof StickerSettings)[T]>;

export const CONTROLLER_TYPES: readonly StickerType[] = ['platformer', 'topdown'];

/** Fills every missing setting with its default (FR-013). */
export function fillStickerSettings<T extends StickerType>(type: T, settings: unknown): StickerSettingsOf<T> {
  return StickerSettings[type].parse(settings ?? {}) as StickerSettingsOf<T>;
}
