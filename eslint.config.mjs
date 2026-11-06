import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The original v4 JS stays under legacy regression testing, and is not rewritten
// or reformatted as part of the React/TS migration.
export default tseslint.config(
  {
    ignores: [
      'node_modules/**', 'storage/**', '**/dist/**', 'js/**',
      'tests/**', 'scripts/**', 'data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-undef': 'off', // TypeScript strict already checks globals and imports.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
