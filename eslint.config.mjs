import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const eslintConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      '**/dist/**',
      'src-tauri/target/**',
      'release/**',
      'node_modules/**',
    ],
  },
  {
    files: ['desktop/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);

export default eslintConfig;
