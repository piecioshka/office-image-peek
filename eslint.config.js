import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'tmp',
      '.superpowers',
      'e2e/fixtures',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
  ...compat.extends('piecioshka'),
  {
    languageOptions: { globals: { window: 'readonly', document: 'readonly' } },
    rules: {
      camelcase: ['error', { properties: 'never' }],
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['src/core/zip/**', 'src/core/image-size.ts'],
    rules: { 'no-bitwise': 'off' },
  },
);
