import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    name: 'repo/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/.vite-temp/**',
      '**/*.tsbuildinfo',
      'packages/server/prisma/generated/**',
      'packages/server/prisma/migrations/**',
      'packages/server/src/templates/emails/*.compiled.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: 'repo/typescript',
    files: ['packages/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.es2022,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    name: 'repo/node-packages',
    files: [
      'packages/server/**/*.{ts,tsx}',
      'packages/web/*.config.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.es2022,
        ...globals.node,
      },
    },
  },
  {
    name: 'repo/vitest',
    files: [
      'packages/server/src/**/*.test.ts',
      'packages/server/src/__tests__/**/*.ts',
      'packages/web/src/**/*.test.{ts,tsx}',
      'packages/web/src/__tests__/**/*.{ts,tsx}',
      'packages/web/src/test/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
  {
    name: 'repo/web-react',
    files: ['packages/web/src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      globals: {
        ...globals.es2022,
        ...globals.browser,
      },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  }
);
