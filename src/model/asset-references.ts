import { rulesReferencing, type LocatedRule } from './references';
import type { Project, Sticker } from './schema';

/**
 * Where a picture or sound is used (US6, edge case "An asset used by objects is
 * deleted"). Shown in the delete warning; rule users are listed separately
 * because deleting turns them broken.
 */
export type AssetUser =
  | { type: 'kind'; kindId: string; label: string }
  | { type: 'sticker'; kindId: string; stickerId: string; label: string }
  | { type: 'object'; sceneId: string; objectId: string; label: string }
  | { type: 'ui'; sceneId: string; uiId: string; label: string }
  | { type: 'background'; sceneId: string; label: string }
  | { type: 'tileSet'; tileSetId: string; label: string }
  | { type: 'music'; label: string }
  | { type: 'rule'; rule: LocatedRule };

const words = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Setting names of a sticker whose value is the asset id. */
function stickerFields(settings: Record<string, unknown> | undefined, assetId: string): string[] {
  return Object.entries(settings ?? {})
    .filter(([, v]) => v === assetId)
    .map(([k]) => (k === 'lookId' ? 'look' : words(k)));
}

export function assetUsers(p: Project, assetId: string): AssetUser[] {
  const out: AssetUser[] = [];
  const kindName = new Map(p.kinds.map((k) => [k.id, k.name]));
  const stickerLabel = (owner: string, s: Sticker, fields: string[]) => `${owner}: ${words(s.type)} sticker (${fields.join(', ')})`;
  for (const k of p.kinds) {
    if (k.lookId === assetId) out.push({ type: 'kind', kindId: k.id, label: k.name });
    for (const s of k.stickers) {
      const fields = stickerFields(s.settings, assetId);
      if (fields.length) out.push({ type: 'sticker', kindId: k.id, stickerId: s.id, label: stickerLabel(k.name, s, fields) });
    }
  }
  for (const scene of p.scenes) {
    for (const o of scene.objects) {
      const ov = o.overrides;
      const uses =
        ov.lookId === assetId ||
        Object.values(ov.stickers ?? {}).some((settings) => stickerFields(settings, assetId).length > 0) ||
        (ov.addStickers ?? []).some((s) => stickerFields(s.settings, assetId).length > 0);
      if (uses) out.push({ type: 'object', sceneId: scene.id, objectId: o.id, label: `${kindName.get(o.kindId) ?? 'Object'} in ${scene.name}` });
    }
    for (const u of scene.ui) if (u.lookId === assetId) out.push({ type: 'ui', sceneId: scene.id, uiId: u.id, label: `Screen item "${u.name}" in ${scene.name}` });
    if ('assetId' in scene.background && scene.background.assetId === assetId) out.push({ type: 'background', sceneId: scene.id, label: `Background of ${scene.name}` });
  }
  for (const t of p.tileSets) if (t.assetId === assetId) out.push({ type: 'tileSet', tileSetId: t.id, label: `Tile set "${t.name}"` });
  if (p.settings.backgroundMusic === assetId) out.push({ type: 'music', label: 'Background music' });
  for (const rule of rulesReferencing(p, { kind: 'asset', id: assetId })) out.push({ type: 'rule', rule });
  return out;
}

/**
 * Removes the asset entry only. References stay dangling on purpose: looks
 * draw the renderer's placeholder and rules turn broken until fixed.
 */
export function deleteAssetFromProject(draft: Project, assetId: string): void {
  const i = draft.assets.findIndex((a) => a.id === assetId);
  if (i >= 0) draft.assets.splice(i, 1);
}
