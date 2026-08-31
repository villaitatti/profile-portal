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
      // Prisma 7 generated client (see packages/server/prisma/schema.prisma)
      'packages/server/src/generated/**',
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
  // Type-aware rules, scoped to src trees (config/scripts files are outside
  // the tsconfigs and stay syntax-only). The promise rules are the payoff:
  // a forgotten `await` in a route/service is a real production bug class,
  // and only type-aware linting can see it.
  {
    name: 'repo/type-aware',
    files: [
      'packages/server/src/**/*.ts',
      'packages/web/src/**/*.{ts,tsx}',
      'packages/shared/src/**/*.ts',
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  // `any` is banned in production src; tests may still use it for mock
  // plumbing (the type-aware promise rules above apply there too, which is
  // where the actual value is).
  {
    name: 'repo/no-any-in-src',
    files: [
      'packages/server/src/**/*.ts',
      'packages/web/src/**/*.{ts,tsx}',
      'packages/shared/src/**/*.ts',
    ],
    ignores: ['**/__tests__/**', '**/*.test.*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
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
