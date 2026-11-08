import { z } from 'zod';
import { CONTROLLER_TYPES, STICKER_TYPES, StickerSettings, type StickerType } from './sticker-settings';

/** Project document schema (data-model.md, contracts/rule-grammar.md). Single source of truth. */

export const SCHEMA_VERSION = 1;

const Id = z.string().min(1).max(64);
const Name = (max: number) => z.string().trim().min(1).max(max);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** An empty blank in a rule; the rule is `incomplete` until it is filled. */
export const Unset = z.object({ unset: z.literal(true) });
export type Unset = z.infer<typeof Unset>;
const orUnset = <T extends z.ZodTypeAny>(t: T) => z.union([t, Unset]);

// ---------- Rule grammar ----------

export const Target = z.discriminatedUnion('t', [
  z.object({ t: z.literal('object'), id: Id }),
  z.object({ t: z.literal('any'), kindId: Id }),
  z.object({ t: z.literal('that'), kindId: Id }),
  z.object({ t: z.literal('self') }),
  z.object({ t: z.literal('ui'), id: Id }),
  z.object({ t: z.literal('unset') }),
]);
export type Target = z.infer<typeof Target>;

/** A value reference; `of` selects the object for per-object values. */
export const ValueRef = z.object({ valueId: Id, of: Target.optional() });
export type ValueRef = z.infer<typeof ValueRef>;

/** Number blank: literal or value reference ("[Per Click]"). */
export const Num = z.union([z.object({ lit: z.number() }), z.object({ ref: ValueRef }), Unset]);
export type Num = z.infer<typeof Num>;

export const RefBlank = orUnset(Id);
export type RefBlank = z.infer<typeof RefBlank>;

export const Point = z.object({ x: Num, y: Num });
export type Point = z.infer<typeof Point>;

export const StickerEvent = z.enum(['collected', 'outOfHealth', 'hurt', 'dropped', 'shoots', 'jumps', 'lands']);
export type StickerEvent = z.infer<typeof StickerEvent>;

export const Trigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sceneStart') }),
  z.object({ type: z.literal('every'), seconds: Num }),
  z.object({ type: z.literal('after'), seconds: Num }),
  z.object({ type: z.literal('key'), key: orUnset(z.string().min(1)), mode: z.enum(['pressed', 'held', 'released']) }),
  z.object({ type: z.literal('clicked'), target: Target }),
  z.object({ type: z.literal('touches'), a: Target, b: Target }),
  z.object({ type: z.literal('valueChanges'), value: orUnset(ValueRef) }),
  z.object({ type: z.literal('valueReaches'), value: orUnset(ValueRef), amount: Num }),
  z.object({ type: z.literal('created'), target: Target }),
  z.object({ type: z.literal('destroyed'), target: Target }),
  z.object({ type: z.literal('leavesScene'), target: Target }),
  z.object({ type: z.literal('sticker'), target: Target, event: StickerEvent }),
]);
export type Trigger = z.infer<typeof Trigger>;
export type TriggerType = Trigger['type'];

export const CompareOp = z.enum(['eq', 'ne', 'lt', 'le', 'gt', 'ge']);
export type CompareOp = z.infer<typeof CompareOp>;

/** Right-hand side of a compare: number, text or true/false literal, or a value reference. */
export const Operand = z.union([
  z.object({ lit: z.union([z.number(), z.string(), z.boolean()]) }),
  z.object({ ref: ValueRef }),
  Unset,
]);
export type Operand = z.infer<typeof Operand>;

export const Condition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('compare'), value: orUnset(ValueRef), op: CompareOp, to: Operand }),
  z.object({ type: z.literal('count'), kindId: RefBlank, op: CompareOp, amount: Num }),
  z.object({ type: z.literal('keyHeld'), key: orUnset(z.string().min(1)) }),
  z.object({ type: z.literal('touching'), a: Target, b: Target }),
  z.object({ type: z.literal('chance'), percent: Num }),
]);
export type Condition = z.infer<typeof Condition>;

export const Direction = z.enum(['up', 'down', 'left', 'right']);
export const Place = z.union([z.object({ at: Point }), z.object({ atTarget: Target })]);
export type Place = z.infer<typeof Place>;

export const Action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('moveTo'), target: Target, to: Place }),
  z.object({ type: z.literal('moveBy'), target: Target, by: Point }),
  z.object({ type: z.literal('setSpeed'), target: Target, speed: Point }),
  z.object({ type: z.literal('push'), target: Target, direction: Direction, strength: Num }),
  z.object({ type: z.literal('create'), kindId: RefBlank, place: Place }),
  z.object({ type: z.literal('destroy'), target: Target }),
  z.object({ type: z.literal('show'), target: Target }),
  z.object({ type: z.literal('hide'), target: Target }),
  z.object({ type: z.literal('changeLook'), target: Target, assetId: RefBlank }),
  z.object({ type: z.literal('animate'), target: Target, assetId: RefBlank, fps: Num, loop: z.boolean() }),
  z.object({
    type: z.literal('changeValue'),
    value: orUnset(ValueRef),
    op: z.enum(['add', 'subtract', 'set']),
    amount: Operand,
  }),
  z.object({ type: z.literal('showText'), text: z.string().max(200), seconds: Num }),
  z.object({ type: z.literal('playSound'), assetId: RefBlank }),
  z.object({ type: z.literal('wait'), seconds: Num }),
  z.object({ type: z.literal('changeScene'), sceneId: RefBlank }),
  z.object({ type: z.literal('restartScene') }),
  z.object({ type: z.literal('shakeCamera'), seconds: Num }),
  z.object({ type: z.literal('share'), text: z.string().max(200) }),
]);
export type Action = z.infer<typeof Action>;
export type ActionType = Action['type'];

export const Rule = z.object({
  id: Id,
  enabled: z.boolean().default(true),
  trigger: Trigger,
  conditions: z
    .object({ join: z.enum(['all', 'any']).default('all'), items: z.array(Condition).max(8).default([]) })
    .default({ join: 'all', items: [] }),
  actions: z.array(Action).min(1).max(20),
  note: z.string().max(300).optional(),
});
export type Rule = z.infer<typeof Rule>;

// ---------- World ----------

export const Value = z
  .object({
    id: Id,
    name: Name(30),
    scope: z.enum(['game', 'object']),
    type: z.enum(['number', 'text', 'bool']),
    start: z.union([z.number(), z.string(), z.boolean()]),
    min: z.number().optional(),
    max: z.number().optional(),
    remember: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const want = v.type === 'number' ? 'number' : v.type === 'text' ? 'string' : 'boolean';
    if (typeof v.start !== want) ctx.addIssue({ code: 'custom', path: ['start'], message: `start must be a ${want}` });
    if (v.type !== 'number' && (v.min !== undefined || v.max !== undefined))
      ctx.addIssue({ code: 'custom', path: ['min'], message: 'min/max only apply to numbers' });
    if (v.min !== undefined && v.max !== undefined && v.min > v.max)
      ctx.addIssue({ code: 'custom', path: ['min'], message: 'min must not exceed max' });
    if (v.remember && v.scope !== 'game')
      ctx.addIssue({ code: 'custom', path: ['remember'], message: 'only game values can be remembered' });
  });
export type Value = z.infer<typeof Value>;

export const Sticker = z
  .object({ id: Id, type: z.enum(STICKER_TYPES as [StickerType, ...StickerType[]]), settings: z.unknown() })
  .transform((s, ctx) => {
    const r = StickerSettings[s.type].safeParse(s.settings ?? {});
    if (!r.success) {
      for (const issue of r.error.issues)
        ctx.addIssue({ code: 'custom', path: ['settings', ...issue.path.map(String)], message: issue.message });
      return z.NEVER;
    }
    return { id: s.id, type: s.type, settings: r.data as Record<string, unknown> };
  });
export type Sticker = z.infer<typeof Sticker>;

function oneController(stickers: { type: StickerType }[], ctx: z.RefinementCtx, path: (string | number)[]) {
  if (stickers.filter((s) => CONTROLLER_TYPES.includes(s.type)).length > 1)
    ctx.addIssue({ code: 'custom', path, message: 'only one controller sticker is allowed' });
}

export const Kind = z
  .object({
    id: Id,
    name: Name(40),
    lookId: z.string().nullable().default(null),
    size: z.object({ w: z.number().positive().max(4096), h: z.number().positive().max(4096) }),
    hitbox: z
      .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
      .optional(),
    stickers: z.array(Sticker).default([]),
    values: z.array(Value).default([]),
    rules: z.array(Rule).default([]),
    layer: z.number().int().default(0),
  })
  .superRefine((k, ctx) => {
    oneController(k.stickers, ctx, ['stickers']);
    uniqueNames(k.values, ctx, 'values');
    for (const [i, v] of k.values.entries())
      if (v.scope !== 'object') ctx.addIssue({ code: 'custom', path: ['values', i, 'scope'], message: 'Kind values are per-object' });
  });
export type Kind = z.infer<typeof Kind>;

export const ObjectInstance = z
  .object({
    id: Id,
    kindId: Id,
    x: z.number(),
    y: z.number(),
    rotation: z.number().default(0),
    scaleX: z.number().default(1),
    scaleY: z.number().default(1),
    layer: z.number().int().default(0),
    overrides: z
      .object({
        stickers: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        addStickers: z.array(Sticker).optional(),
        values: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
        lookId: z.string().nullable().optional(),
        hidden: z.boolean().optional(),
      })
      .default({}),
  });
export type ObjectInstance = z.infer<typeof ObjectInstance>;

export const Anchor = z.enum(['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']);
export type Anchor = z.infer<typeof Anchor>;

export const UIElement = z.object({
  id: Id,
  name: Name(40),
  type: z.enum(['text', 'button', 'image']),
  x: z.number(),
  y: z.number(),
  anchor: Anchor.default('tl'),
  text: z.string().max(200).default(''),
  style: z
    .object({ size: z.number().min(6).max(200).default(24), color: Hex.default('#ffffff'), font: z.enum(['pixel', 'round', 'bold']).default('round') })
    .default({ size: 24, color: '#ffffff', font: 'round' }),
  lookId: z.string().nullable().optional(),
  hidden: z.boolean().default(false),
});
export type UIElement = z.infer<typeof UIElement>;

export const Background = z.union([
  z.object({ color: Hex }),
  z.object({ assetId: Id, mode: z.enum(['stretch', 'tile', 'parallax']) }),
]);

export const TileLayer = z.object({
  tileSetId: z.string().nullable().default(null),
  cellSize: z.number().int().min(8).max(128).default(32),
  cells: z.record(z.string().regex(/^-?\d+,-?\d+$/), z.number().int().min(0)).default({}),
});
export type TileLayer = z.infer<typeof TileLayer>;

export const Scene = z
  .object({
    id: Id,
    name: Name(40),
    width: z.number().int().max(20000),
    height: z.number().int().max(20000),
    background: Background.default({ color: '#87ceeb' }),
    tileLayer: TileLayer.default({ tileSetId: null, cellSize: 32, cells: {} }),
    objects: z.array(ObjectInstance).default([]),
    ui: z.array(UIElement).default([]),
    rules: z.array(Rule).default([]),
  })
  .superRefine((s, ctx) => uniqueNames(s.ui, ctx, 'ui'));
export type Scene = z.infer<typeof Scene>;

export const Asset = z.discriminatedUnion('kind', [
  z.object({
    id: Id,
    name: Name(60),
    kind: z.literal('image'),
    source: z.enum(['builtin', 'drawn', 'imported']),
    frames: z.object({ w: z.number().int().positive(), h: z.number().int().positive(), count: z.number().int().min(1), fps: z.number().min(1).max(60).default(8) }),
    mime: z.string().default('image/png'),
  }),
  z.object({
    id: Id,
    name: Name(60),
    kind: z.literal('sound'),
    source: z.enum(['builtin', 'imported']),
    duration: z.number().min(0),
    mime: z.string(),
  }),
]);
export type Asset = z.infer<typeof Asset>;

export const TileSet = z.object({
  id: Id,
  name: Name(40),
  assetId: Id,
  tileSize: z.number().int().min(8).max(128),
  columns: z.number().int().min(1),
  count: z.number().int().min(1),
  solid: z.array(z.boolean()),
  oneWay: z.array(z.boolean()).default([]),
});
export type TileSet = z.infer<typeof TileSet>;

export const Settings = z.object({
  screenWidth: z.number().int().min(320).max(1920).default(960),
  screenHeight: z.number().int().min(240).max(1080).default(540),
  pixelArt: z.boolean().default(true),
  showMeKey: z.string().default('F2'),
  backgroundMusic: z.string().nullable().default(null),
});

export const Project = z
  .object({
    id: Id,
    schemaVersion: z.literal(SCHEMA_VERSION),
    name: Name(60),
    createdAt: z.string(),
    updatedAt: z.string(),
    settings: Settings.default({ screenWidth: 960, screenHeight: 540, pixelArt: true, showMeKey: 'F2', backgroundMusic: null }),
    startSceneId: Id,
    scenes: z.array(Scene).min(1),
    kinds: z.array(Kind).default([]),
    values: z.array(Value).default([]),
    rules: z.array(Rule).default([]),
    assets: z.array(Asset).default([]),
    tileSets: z.array(TileSet).default([]),
    tourCompleted: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (!p.scenes.some((s) => s.id === p.startSceneId))
      ctx.addIssue({ code: 'custom', path: ['startSceneId'], message: 'start scene does not exist' });
    uniqueNames(p.scenes, ctx, 'scenes');
    uniqueNames(p.kinds, ctx, 'kinds');
    uniqueNames(p.values, ctx, 'values');
    for (const [i, v] of p.values.entries())
      if (v.scope !== 'game') ctx.addIssue({ code: 'custom', path: ['values', i, 'scope'], message: 'project values are game-wide' });
    const { width, height } = { width: p.settings.screenWidth, height: p.settings.screenHeight };
    for (const [i, s] of p.scenes.entries())
      if (s.width < width || s.height < height)
        ctx.addIssue({ code: 'custom', path: ['scenes', i, 'width'], message: 'scene must be at least the screen size' });
    const kindIds = new Set(p.kinds.map((k) => k.id));
    for (const [i, s] of p.scenes.entries())
      for (const [j, o] of s.objects.entries()) {
        if (!kindIds.has(o.kindId))
          ctx.addIssue({ code: 'custom', path: ['scenes', i, 'objects', j, 'kindId'], message: 'unknown Kind' });
        const kind = p.kinds.find((k) => k.id === o.kindId);
        if (kind && o.overrides.addStickers)
          oneController([...kind.stickers, ...o.overrides.addStickers], ctx, ['scenes', i, 'objects', j, 'overrides']);
      }
  });
export type Project = z.infer<typeof Project>;
/** Input shape (defaults optional) - what presets and fixtures are written in. */
export type ProjectInput = z.input<typeof Project>;

function uniqueNames(items: { name: string }[], ctx: z.RefinementCtx, path: string) {
  const seen = new Set<string>();
  for (const [i, it] of items.entries()) {
    const key = it.name.trim().toLowerCase();
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [path, i, 'name'], message: `name "${it.name}" is used twice` });
    seen.add(key);
  }
}
