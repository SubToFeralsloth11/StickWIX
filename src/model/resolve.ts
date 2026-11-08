import type { Kind, ObjectInstance, Sticker } from './schema';
import { fillStickerSettings } from './sticker-settings';

export interface ResolvedObject {
  stickers: Sticker[];
  values: Record<string, number | string | boolean>;
  lookId: string | null;
  hidden: boolean;
}

/**
 * Kind defaults + per-object overrides → the settings an object actually uses (FR-009).
 * Overrides hold only keys that differ, so removing one restores the Kind default.
 */
export function resolveObject(kind: Kind, obj: Pick<ObjectInstance, 'overrides'>): ResolvedObject {
  const o = obj.overrides ?? {};
  const stickers = kind.stickers.map((s) => {
    const patch = o.stickers?.[s.id];
    return patch ? { ...s, settings: fillStickerSettings(s.type, { ...s.settings, ...patch }) } : s;
  });
  for (const extra of o.addStickers ?? []) stickers.push(extra);
  const values: Record<string, number | string | boolean> = {};
  for (const v of kind.values) values[v.id] = o.values?.[v.id] ?? v.start;
  return {
    stickers,
    values,
    lookId: o.lookId !== undefined ? o.lookId : kind.lookId,
    hidden: o.hidden ?? false,
  };
}
