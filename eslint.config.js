import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const noEditorOrReact = {
  patterns: [
    { group: ['**/editor/**', '@/editor/*', '@/editor/**'], message: 'runtime/model/showme must not import editor code.' },
    { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'runtime/model/showme must stay React-free.' },
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'progress', 'test-results', 'playwright-report', '.local'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/editor/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    files: ['src/runtime/**', 'src/model/**', 'src/showme/**', 'src/lint/**', 'src/player/**'],
    rules: { 'no-restricted-imports': ['error', noEditorOrReact] },
  },
);
