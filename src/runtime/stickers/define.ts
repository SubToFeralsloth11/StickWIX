import type { StickerEvent } from '../../model/schema';
import type { StickerSettingsOf, StickerType } from '../../model/sticker-settings';
import type { Instance, SettingField, StepCtx, StickerModule } from '../types';

type State = Record<string, unknown>;

export interface TypedStickerModule<T extends StickerType> {
  type: T;
  category: StickerModule['category'];
  label: string;
  help: string;
  icon: string;
  fields: (SettingField & { key: keyof StickerSettingsOf<T> & string })[];
  events?: { id: StickerEvent; phrase: string }[];
  init?(inst: Instance, s: StickerSettingsOf<T>, state: State, ctx: StepCtx): void;
  step?(inst: Instance, s: StickerSettingsOf<T>, state: State, ctx: StepCtx): void;
  onContact?(inst: Instance, other: Instance, s: StickerSettingsOf<T>, state: State, ctx: StepCtx): void;
}

/**
 * Declares a sticker with settings typed from its Zod schema. Settings reaching
 * a module were already validated by the document schema, which is what makes
 * the one widening cast below sound.
 */
export function defineSticker<T extends StickerType>(m: TypedStickerModule<T>): StickerModule {
  return m as unknown as StickerModule;
}

export const KEYS = {
  left: { arrows: ['ArrowLeft'], wasd: ['KeyA'] },
  right: { arrows: ['ArrowRight'], wasd: ['KeyD'] },
  up: { arrows: ['ArrowUp'], wasd: ['KeyW'] },
  down: { arrows: ['ArrowDown'], wasd: ['KeyS'] },
} as const;

/** Key codes for a direction under a 'both' | 'arrows' | 'wasd' setting. */
export function keysFor(dir: keyof typeof KEYS, scheme: 'both' | 'arrows' | 'wasd'): readonly string[] {
  return scheme === 'both' ? [...KEYS[dir].arrows, ...KEYS[dir].wasd] : KEYS[dir][scheme];
}

export function anyHeld(held: Set<string>, codes: readonly string[]) {
  return codes.some((c) => held.has(c));
}

/** Kinds a "target Kind" setting refers to: the chosen Kind, or every controller holder by default. */
export function targetKinds(setting: string | null, ctx: StepCtx): string[] {
  return setting ? [setting] : ctx.world.controllerKindIds();
}

export function center(i: Instance) {
  return { x: i.x + i.hit.x + i.hit.w / 2, y: i.y + i.hit.y + i.hit.h / 2 };
}
