import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { inlineAssets } from './scripts/vite-inline-assets';

const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url));

/** The editor's page. index.html at the repo root is the published game GitHub Pages serves. */
const EDITOR_HTML = 'editor.html';

/** Serves the editor at `/` in `pnpm dev`, since index.html at the root is the published game. */
function editorAtRoot(): Plugin {
  return {
    name: 'stickwix-editor-at-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) req.url = `/${EDITOR_HTML}${req.url.slice(1)}`;
        next();
      });
    },
  };
}

/** Names the built editor page: StickWIX.html for the single file, index.html for a web server. */
function renameEditorFile(fileName: string): Plugin {
  return {
    name: 'stickwix-editor-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle[EDITOR_HTML];
      if (!html) this.error(`${EDITOR_HTML} was not produced`);
      html.fileName = fileName;
    },
  };
}

/**
 * `vite build` → dist/ (static files for a web server).
 * `vite build --mode file` (`pnpm build:file`) → dist-file/StickWIX.html: the whole
 * editor, built-in assets and player template in one file that opens from file://.
 */
export default defineConfig(({ mode }) => {
  const file = mode === 'file';
  return {
    plugins: [
      react(),
      inlineAssets(file, PUBLIC_DIR),
      editorAtRoot(),
      ...(file ? [viteSingleFile(), renameEditorFile('StickWIX.html')] : [renameEditorFile('index.html')]),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5199, strictPort: true },
    // Everything is inlined, so public/ (the files it would copy) is not needed next to the html.
    publicDir: file ? false : 'public',
    build: {
      outDir: file ? 'dist-file' : 'dist',
      chunkSizeWarningLimit: file ? 6000 : 1500,
      rollupOptions: { input: fileURLToPath(new URL(`./${EDITOR_HTML}`, import.meta.url)) },
    },
  };
});
