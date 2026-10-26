import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { inlineAssets } from './scripts/vite-inline-assets';

const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url));

/** Names the single-file editor so it is obvious what to double-click. */
function renameEditorFile(): Plugin {
  return {
    name: 'stickwix-editor-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html) this.error('index.html was not produced');
      html.fileName = 'StickWIX.html';
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
    plugins: [react(), inlineAssets(file, PUBLIC_DIR), ...(file ? [viteSingleFile(), renameEditorFile()] : [])],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5199, strictPort: true },
    // Everything is inlined, so public/ (the files it would copy) is not needed next to the html.
    publicDir: file ? false : 'public',
    build: { outDir: file ? 'dist-file' : 'dist', chunkSizeWarningLimit: file ? 6000 : 1500 },
  };
});
