/**
 * Compiles every `*.mjml` source under `src/templates/emails/` to a
 * companion `*.compiled.html` file, except files beginning with `_`
 * (those are partials, consumed by other templates via `<mj-include>`
 * and never rendered directly).
 *
 * Include resolution: MJML 5's `<mj-include path="...">` behavior is
 * fussy with <mj-head> children. Rather than fight it, this script
 * pre-processes includes itself via string substitution before handing
 * the text to MJML. One pass, recursive up to 10 levels deep (plenty).
 *
 * Compiled HTML is checked into the repo. Production does NOT compile
 * at runtime. CI runs this script and then asserts `git diff` is empty
 * so a developer can't forget to recompile after editing a template.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// mjml's default export is the compile function. In 5.x it is async;
// in 4.x it was sync. `await` is safe either way.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error: mjml ships no types in some versions
import mjml2html from 'mjml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', 'src', 'templates', 'emails');

const INCLUDE_RE = /<mj-include\s+path=["']([^"']+)["']\s*\/>/g;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const MAX_INCLUDE_DEPTH = 10;

/**
 * Scan for mj-include outside of HTML comments. Doc comments in the
 * partial files often mention mj-include in prose, which matches our
 * regex literally — stripping comments first avoids infinite recursion
 * and also keeps the compiled HTML cleaner.
 */
async function inlineIncludes(
  source: string,
  baseDir: string,
  depth = 0
): Promise<string> {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`mj-include depth exceeded ${MAX_INCLUDE_DEPTH} levels`);
  }

  // Strip HTML comments ONLY for scanning; the final output passes the
  // raw (commented) string to MJML, which drops comments via keepComments:false.
  const scannable = source.replace(HTML_COMMENT_RE, '');
  const matches = Array.from(scannable.matchAll(INCLUDE_RE));
  if (matches.length === 0) return source;

  const replacements = new Map<string, string>();
  for (const m of matches) {
    const relPath = m[1];
    if (replacements.has(relPath)) continue;
    const absPath = resolve(baseDir, relPath);
    let raw = await readFile(absPath, 'utf8');
    raw = await inlineIncludes(raw, dirname(absPath), depth + 1);
    replacements.set(relPath, raw);
  }

  // Replace includes in the ORIGINAL source (comments intact) so MJML's
  // keepComments:false strips them consistently. Match only those NOT
  // inside comments by running replace against a masked-comment view.
  const commentRanges: Array<[number, number]> = [];
  HTML_COMMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HTML_COMMENT_RE.exec(source)) !== null) {
    commentRanges.push([m.index, m.index + m[0].length]);
  }
  const inComment = (idx: number): boolean =>
    commentRanges.some(([s, e]) => idx >= s && idx < e);

  INCLUDE_RE.lastIndex = 0;
  let out = '';
  let cursor = 0;
  while ((m = INCLUDE_RE.exec(source)) !== null) {
    if (inComment(m.index)) continue;
    const rel = m[1];
    const replacement = replacements.get(rel)!;
    out += source.slice(cursor, m.index) + replacement;
    cursor = m.index + m[0].length;
  }
  out += source.slice(cursor);
  return out;
}

async function main(): Promise<void> {
  const entries = await readdir(TEMPLATES_DIR);
  const sources = entries.filter(
    (f) => f.endsWith('.mjml') && !basename(f).startsWith('_')
  );

  if (sources.length === 0) {
    console.log(`No .mjml sources found in ${TEMPLATES_DIR}`);
    return;
  }

  let errors = 0;
  for (const source of sources) {
    const sourcePath = join(TEMPLATES_DIR, source);
    const outputPath = sourcePath.replace(/\.mjml$/, '.compiled.html');
    const raw = await readFile(sourcePath, 'utf8');
    const expanded = await inlineIncludes(raw, dirname(sourcePath));

    const result = await mjml2html(expanded, {
      filePath: sourcePath,
      validationLevel: 'strict',
      keepComments: false,
      minify: false,
    });

    if (result.errors && result.errors.length > 0) {
      errors += result.errors.length;
      for (const err of result.errors) {
        console.error(`  [${source}] ${err.formattedMessage}`);
      }
      continue;
    }

    await writeFile(outputPath, result.html + '\n', 'utf8');
    console.log(`  compiled: ${source} -> ${basename(outputPath)}`);
  }

  if (errors > 0) {
    console.error(`\nFailed with ${errors} error(s).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
