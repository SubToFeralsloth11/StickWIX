import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { inlineAssets } from './scripts/vite-inline-assets';

export default defineConfig({
  plugins: [inlineAssets(false, fileURLToPath(new URL('./public', import.meta.url)))],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    // AGENTS.md machine limits: keep the worker pool small.
    pool: 'threads',
    maxWorkers: 2,
  },
});
