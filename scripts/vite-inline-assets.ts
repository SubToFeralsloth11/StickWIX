import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { Plugin } from 'vite';

/** Virtual module read by the editor; typed in src/inline-assets.d.ts. */
const ID = 'virtual:stickwix-inline';
const RESOLVED = `\0${ID}`;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/**
 * Provides `virtual:stickwix-inline`. When `enabled` (the `pnpm build:file`
 * single-file editor), it holds every built-in asset as a data URL keyed by its
 * manifest `file` path, plus the game-player template, so the editor runs from
 * file:// where the browser refuses to fetch neighbouring files. Otherwise both
 * exports are null and the editor fetches them from the server as usual.
 */
export function inlineAssets(enabled: boolean, publicDir: string): Plugin {
  return {
    name: 'stickwix-inline-assets',
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null;
      if (!enabled) return 'export const builtinFiles = null;\nexport const playerTemplate = null;\n';
      const root = join(publicDir, 'assets/builtin');
      const files: Record<string, string> = {};
      for (const path of walk(root)) {
        const mime = MIME[extname(path)];
        if (mime) files[relative(root, path)] = `data:${mime};base64,${readFileSync(path).toString('base64')}`;
      }
      const template = readFileSync(join(publicDir, 'player-template.html'), 'utf8');
      return `export const builtinFiles = ${JSON.stringify(files)};\nexport const playerTemplate = ${JSON.stringify(template)};\n`;
    },
  };
}
