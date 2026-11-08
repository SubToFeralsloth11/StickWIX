import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { builtinAssetUrl, loadManifest as fetchManifest, type BuiltinManifest } from '@/assets/manifest';
import type { Asset, Project } from '@/model/schema';
import { builtinName } from '@/model/sentence';
import type { AssetInfo } from '@/runtime/render/renderer';
import { getAsset } from '@/storage/db';

interface LibState {
  manifest: BuiltinManifest | null;
  error: string | null;
  /** Object URLs for project asset blobs, keyed `${projectId}:${assetId}`. */
  blobUrls: Record<string, string>;
}

const useLib = create<LibState>(() => ({ manifest: null, error: null, blobUrls: {} }));
let manifestLoad: Promise<void> | null = null;

/** Loads the built-in manifest once per page. */
export function loadManifest(): Promise<void> {
  manifestLoad ??= fetchManifest()
    .then((manifest) => useLib.setState({ manifest }))
    .catch((e) => useLib.setState({ error: `Built-in art could not load: ${String(e)}` }));
  return manifestLoad;
}

/** The loaded manifest, for non-React code (export, tour). */
export function currentManifest() {
  return useLib.getState().manifest;
}

/** Makes object URLs for a project's stored blobs (drawn and imported assets). */
export async function loadProjectBlobs(projectId: string, assets: readonly Asset[]) {
  const have = useLib.getState().blobUrls;
  const next: Record<string, string> = {};
  for (const a of assets) {
    if (a.source === 'builtin') continue;
    const key = `${projectId}:${a.id}`;
    if (have[key]) continue;
    const blob = await getAsset(projectId, a.id);
    if (blob) next[key] = URL.createObjectURL(blob);
  }
  if (Object.keys(next).length) useLib.setState({ blobUrls: { ...useLib.getState().blobUrls, ...next } });
}

/** Registers a freshly drawn/imported blob without a database round trip. */
export function putBlobUrl(projectId: string, assetId: string, blob: Blob) {
  const key = `${projectId}:${assetId}`;
  const old = useLib.getState().blobUrls[key];
  if (old) URL.revokeObjectURL(old);
  useLib.setState({ blobUrls: { ...useLib.getState().blobUrls, [key]: URL.createObjectURL(blob) } });
}

export interface ImageEntry {
  id: string;
  name: string;
  url: string;
  w: number;
  h: number;
  frames: number;
  fps: number;
  category: string;
  theme: string;
  source: 'builtin' | 'drawn' | 'imported';
}

export interface Library {
  ready: boolean;
  error: string | null;
  manifest: BuiltinManifest | null;
  url(id: string): string | undefined;
  info: AssetInfo;
  name(id: string): string | undefined;
  images(): ImageEntry[];
  sounds(): { id: string; name: string; url: string; category: string; source: string }[];
}

export function makeLibrary(manifest: BuiltinManifest | null, project: Project | null, blobUrls: Record<string, string>, error: string | null = null): Library {
  const own = new Map((project?.assets ?? []).map((a) => [a.id, a]));
  const url = (id: string) => {
    if (id.startsWith('builtin:')) {
      const m = manifest?.images[id] ?? manifest?.tilesets[id] ?? manifest?.sounds[id];
      return m ? builtinAssetUrl(m.file) : undefined;
    }
    // Only assets still in the project: a deleted asset must show the placeholder, while undo can bring it back.
    return project && own.has(id) ? blobUrls[`${project.id}:${id}`] : undefined;
  };
  const info: AssetInfo = (id) => {
    const b = manifest?.images[id];
    if (b) return { w: b.w, h: b.h, frames: b.frames, fps: b.fps };
    const a = own.get(id);
    return a && a.kind === 'image' ? { w: a.frames.w, h: a.frames.h, frames: a.frames.count, fps: a.frames.fps } : undefined;
  };
  return {
    ready: !!manifest,
    error,
    manifest,
    url,
    info,
    name: (id) => manifest?.images[id]?.name ?? manifest?.sounds[id]?.name ?? manifest?.tilesets[id]?.name ?? own.get(id)?.name ?? (id.startsWith('builtin:') ? builtinName(id) : undefined),
    images: () => [
      ...Object.entries(manifest?.images ?? {}).map(([id, m]) => ({ id, name: m.name, url: builtinAssetUrl(m.file), w: m.w, h: m.h, frames: m.frames, fps: m.fps, category: m.category, theme: m.theme, source: 'builtin' as const })),
      ...(project?.assets ?? []).flatMap((a) =>
        a.kind === 'image' && a.source !== 'builtin'
          ? [{ id: a.id, name: a.name, url: url(a.id) ?? '', w: a.frames.w, h: a.frames.h, frames: a.frames.count, fps: a.frames.fps, category: 'mine', theme: 'any', source: a.source }]
          : [],
      ),
    ],
    sounds: () => [
      ...Object.entries(manifest?.sounds ?? {}).map(([id, m]) => ({ id, name: m.name, url: builtinAssetUrl(m.file), category: m.category, source: 'builtin' })),
      ...(project?.assets ?? []).flatMap((a) => (a.kind === 'sound' ? [{ id: a.id, name: a.name, url: url(a.id) ?? '', category: 'mine', source: a.source }] : [])),
    ],
  };
}

/** The asset library for a project, re-made when assets or blob URLs change. */
export function useLibrary(project: Project | null): Library {
  const { manifest, blobUrls, error } = useLib();
  useEffect(() => {
    void loadManifest();
  }, []);
  useEffect(() => {
    if (project) void loadProjectBlobs(project.id, project.assets);
  }, [project?.id, project?.assets]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => makeLibrary(manifest, project, blobUrls, error), [manifest, project, blobUrls, error]);
}
