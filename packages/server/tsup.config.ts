import { defineConfig } from 'tsup';
import { readFileSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, join } from 'path';

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

/**
 * Copy the compiled email templates (and their plaintext fallbacks) from the
 * source tree into dist/emails so the runtime renderer's readFileSync lookup
 * (src/templates/render.ts → `EMAILS_DIR = join(__dirname, 'emails')`)
 * resolves correctly inside the tsup-bundled output. MJML source files and
 * partials are NOT copied — only the pre-compiled HTML + plaintext fallback.
 * Without this, production crashes with ENOENT on the first send.
 */
function copyEmailTemplates() {
  const srcDir = resolve(__dirname, 'src/templates/emails');
  const destDir = resolve(__dirname, 'dist/emails');
  mkdirSync(destDir, { recursive: true });
  for (const file of readdirSync(srcDir)) {
    if (file.endsWith('.compiled.html') || file.endsWith('.txt')) {
      copyFileSync(join(srcDir, file), join(destDir, file));
    }
  }
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  noExternal: ['@itatti/shared'],
  define: {
    '__APP_VERSION__': JSON.stringify(rootPkg.version),
  },
  onSuccess: async () => {
    copyEmailTemplates();
  },
});
