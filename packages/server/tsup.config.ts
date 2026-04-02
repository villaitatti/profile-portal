import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  noExternal: ['@itatti/shared'],
  define: {
    '__APP_VERSION__': JSON.stringify(rootPkg.version),
  },
});
