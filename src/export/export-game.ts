import type { BuiltinManifest } from '@/assets/manifest';
import type { Project } from '@/model/schema';
import type { FrameInfo, GamePayload } from '@/player/payload';

/** The one placeholder in public/player-template.html that the payload replaces. */
export const GAME_PLACEHOLDER = '__STICKWIX_GAME__';

export interface ExportGameOptions {
  /** Contents of player-template.html. */
  template: string;
  /** Stored blob of a drawn/imported asset. */
  loadAsset: (assetId: string) => Promise<Blob | undefined>;
  /** Fetchable URL of a builtin asset; undefined when the manifest does not know it. */
  builtinUrl: (assetId: string) => string | undefined;
  manifest: BuiltinManifest | null;
  fetch?: typeof fetch;
}

const BUILTIN = 'builtin:';

/**
 * Every asset id the game can show or play: looks, sticker look/sound
 * settings, rule assets, UI looks, backgrounds, tile sheets and music.
 * Walks the whole document (minus the asset list itself), so per-object
 * overrides and future fields are covered without a list to keep in sync.
 */
export function referencedAssetIds(project: Project): Set<string> {
  const own = new Set(project.assets.map((a) => a.id));
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      if (own.has(node) || node.startsWith(BUILTIN)) found.add(node);
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk({ ...project, assets: [], id: '', name: '' });
  return found;
}

const MIME_BY_EXT: Record<string, string> = { png: 'image/png', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' };

async function dataUrl(blob: Blob, fallbackType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked so large sounds do not overflow the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const type = blob.type.split(';')[0]?.trim() || fallbackType;
  return `data:${type};base64,${btoa(binary)}`;
}

/** JSON that is safe inside `<script type="application/json">`: no `</`, `<!--`, or raw line separators. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '\\u003c!--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Builds the single self-contained HTML file of a playable game (FR-035). */
export async function exportGame(project: Project, opts: ExportGameOptions): Promise<string> {
  const parts = opts.template.split(GAME_PLACEHOLDER);
  if (parts.length !== 2) throw new Error('The game player is missing or broken, so the game could not be exported.');
  const doFetch = opts.fetch ?? fetch;
  const own = new Map(project.assets.map((a) => [a.id, a]));
  const assets: Record<string, string> = {};
  const images: Record<string, FrameInfo> = {};

  for (const id of referencedAssetIds(project)) {
    if (id.startsWith(BUILTIN)) {
      const url = opts.builtinUrl(id);
      // Unknown builtin keys show the missing-image placeholder in the editor too.
      if (!url) continue;
      let blob: Blob;
      try {
        const res = await doFetch(url);
        if (!res.ok) throw new Error(String(res.status));
        blob = await res.blob();
      } catch {
        throw new Error(`The built-in asset "${id.slice(BUILTIN.length)}" could not be loaded, so the game could not be exported.`);
      }
      assets[id] = await dataUrl(blob, MIME_BY_EXT[url.split('.').pop() ?? ''] ?? 'application/octet-stream');
      const info = opts.manifest?.images[id];
      if (info) images[id] = { w: info.w, h: info.h, frames: info.frames, fps: info.fps };
    } else {
      const asset = own.get(id)!;
      const blob = await opts.loadAsset(id);
      if (!blob) throw new Error(`The ${asset.kind} "${asset.name}" could not be read, so the game could not be exported.`);
      assets[id] = await dataUrl(blob, asset.mime);
    }
  }

  const payload: GamePayload = { project, assets, manifest: { images } };
  return parts[0] + scriptSafeJson(payload) + parts[1];
}

/** Saves a file through the browser's download flow. */
export function downloadFile(name: string, data: Blob | string, type = 'text/html'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers start the download asynchronously; keep the URL alive briefly.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
