import type { BuiltinManifest } from '@/assets/manifest';
import { newProject } from '@/model/defaults';
import { newId } from '@/model/ids';
import type { Project, TileSet } from '@/model/schema';

/** Project tile sets for every built-in tile sheet, so painting works right away. */
export function builtinTileSets(manifest: BuiltinManifest | null): TileSet[] {
  return Object.entries(manifest?.tilesets ?? {}).map(([key, t]) => ({
    id: newId('t'),
    name: t.name,
    assetId: key,
    tileSize: t.tileSize,
    columns: t.columns,
    count: t.count,
    solid: [...t.solid],
    oneWay: [...t.oneWay],
  }));
}

/** A blank project: one sky-blue scene twice the screen width, built-in tile sets ready. */
export function blankProject(name: string, manifest: BuiltinManifest | null): Project {
  const p = newProject(name.trim().slice(0, 60) || 'My Game');
  p.tileSets = builtinTileSets(manifest);
  const scene = p.scenes[0]!;
  scene.width = p.settings.screenWidth * 2;
  scene.tileLayer.tileSetId = p.tileSets.find((t) => t.assetId === 'builtin:tiles/grass')?.id ?? p.tileSets[0]?.id ?? null;
  return p;
}
