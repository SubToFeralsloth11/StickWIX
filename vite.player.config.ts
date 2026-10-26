import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

/** Output name of the template the editor's game exporter fetches (contracts/exported-game.md). */
const TEMPLATE = 'player-template.html';

/** Renames the built player.html so it lands in public/ as the export template. */
function renameTemplate(): Plugin {
  return {
    name: 'stickwix-player-template',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['player.html'];
      if (!html) this.error('player.html was not produced');
      html.fileName = TEMPLATE;
    },
  };
}

const EMPTY_MODULE = '\0stickwix:empty';

/** Pixi side-effect imports replaced by an empty module: `${importer dir in pixi.js/lib}|${source}`. */
const PIXI_STUBS = [
  // Lazy browser environment: accessibility, DOM overlays, pointer events, filters.
  'environment-browser/|./browserAll.mjs',
  // Same for web workers; the player never runs in one.
  'environment-webworker/|./webworkerAll.mjs',
  // Spritesheet loading through Assets (pulls the URL resolver); the runtime slices strips itself.
  '|./spritesheet/init.mjs',
];

/**
 * Keeps PixiJS within the 600 KB player budget (T113) by dropping features
 * the game renderer never uses; the editor build is unaffected.
 * - The runtime reads input from the DOM itself and uses no filters,
 *   accessibility or spritesheets, so those registrations become empty.
 * - The renderer asks for WebGL, and Pixi's auto-detection would also inline
 *   the whole WebGPU renderer; that branch is removed, keeping WebGL with the
 *   Canvas 2D renderer as the fallback.
 * Every patch fails the build if a Pixi upgrade changes the code it targets.
 */
function slimPixi(): Plugin {
  const WEBGPU_BRANCH = 'rendererType === "webgpu" && await isWebGPUSupported()';
  const hits = new Set<string>();
  let patchedAutoDetect = false;
  return {
    name: 'stickwix-slim-pixi',
    enforce: 'pre',
    resolveId(source, importer) {
      const dir = importer?.match(/\/pixi\.js\/lib\/(.*?)[^/]*$/)?.[1];
      if (dir === undefined) return null;
      const key = `${dir}|${source}`;
      if (!PIXI_STUBS.includes(key)) return null;
      hits.add(key);
      return EMPTY_MODULE;
    },
    load(id) {
      return id === EMPTY_MODULE ? 'export {};' : null;
    },
    transform(code, id) {
      if (!id.includes('/pixi.js/lib/rendering/renderers/autoDetectRenderer.mjs')) return null;
      if (!code.includes(WEBGPU_BRANCH)) this.error('Pixi autoDetectRenderer changed: update slimPixi() in vite.player.config.ts');
      patchedAutoDetect = true;
      return { code: code.replace(WEBGPU_BRANCH, 'false'), map: null };
    },
    buildEnd(error) {
      if (error) return;
      const missed = PIXI_STUBS.filter((k) => !hits.has(k));
      if (missed.length || !patchedAutoDetect)
        this.error(`Pixi changed; slimPixi() in vite.player.config.ts no longer matches: ${[...missed, ...(patchedAutoDetect ? [] : ['autoDetectRenderer'])].join(', ')}`);
    },
  };
}

/**
 * Builds the exported-game player (src/player/main.ts) into ONE html file with
 * all JS/CSS inlined: public/player-template.html. Run with `pnpm build:player`.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // The output goes into public/, so public/ must not be copied into itself.
  publicDir: false,
  plugins: [slimPixi(), viteSingleFile({ removeViteModuleLoader: true }), renameTemplate()],
  build: {
    outDir: 'public',
    emptyOutDir: false,
    target: 'es2022',
    minify: 'esbuild',
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    rollupOptions: { input: fileURLToPath(new URL('./player.html', import.meta.url)) },
  },
  esbuild: { legalComments: 'none' },
});
