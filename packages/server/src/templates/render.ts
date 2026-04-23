import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

/**
 * Email template renderer.
 *
 * Templates live in this directory as paired `.mjml`/`.txt` files. The
 * `.mjml` source is compiled to `.compiled.html` at build time (see
 * scripts/build-email-templates.ts). Compiled HTML is committed to the
 * repo so production never depends on `mjml` at runtime.
 *
 * Substitution is a simple `String.replaceAll('{{key}}', value)`. Two
 * tokens per template is well below the threshold where Handlebars /
 * MJML's built-in `mj-style` variables would pay for themselves.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EMAILS_DIR = join(__dirname, 'emails');

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Thrown by renderers when a required substitution value is missing.
 * Route handlers surface this as a structured error the UI can explain
 * ("This appointee is missing a first name in CiviCRM").
 */
export class TemplateRenderError extends Error {
  constructor(public readonly reason: 'missing_first_name') {
    super(`Template render failed: ${reason}`);
    this.name = 'TemplateRenderError';
  }
}

/**
 * Loaded on first call and cached in-process. readFileSync is fine here:
 * these files are small (~10KB) and we only read two of them per process.
 */
let cache: {
  vitIdHtml: string;
  vitIdText: string;
  bioHtml: string;
  bioText: string;
} | null = null;

function loadTemplates(): NonNullable<typeof cache> {
  if (cache) return cache;
  cache = {
    vitIdHtml: readFileSync(
      join(EMAILS_DIR, 'vit-id-invitation.compiled.html'),
      'utf8'
    ),
    vitIdText: readFileSync(
      join(EMAILS_DIR, 'vit-id-invitation.txt'),
      'utf8'
    ),
    bioHtml: readFileSync(
      join(EMAILS_DIR, 'bio-project-description.compiled.html'),
      'utf8'
    ),
    bioText: readFileSync(
      join(EMAILS_DIR, 'bio-project-description.txt'),
      'utf8'
    ),
  };
  return cache;
}

/**
 * Clears the in-process template cache. Tests call this after mocking
 * the fs layer. Production code must not call this.
 */
export function __resetTemplateCacheForTests(): void {
  cache = null;
}

function buildLogoUrl(): string {
  // PORTAL_PUBLIC_URL is validated as a URL at startup (see env.ts). We
  // tolerate a trailing slash for operator ergonomics.
  const base = env.PORTAL_PUBLIC_URL.replace(/\/+$/, '');
  return `${base}/itatti-logo-email.png`;
}

/**
 * HTML-escape the five characters that can corrupt an email body when a
 * value is substituted directly into HTML context. A CiviCRM first name
 * like `O'Brien <Jr>` or `Smith & Jones` would otherwise break entity
 * parsing downstream (angle brackets spawn dangling tags; ampersands
 * break the entity stream). Plaintext substitutions are untouched —
 * plaintext email bodies are plain text and don't need escaping.
 *
 * Defense in depth: the EmailPreviewModal renders HTML inside an iframe
 * sandboxed with allow-same-origin (no scripts), so portal-side risk is
 * already bounded. The recipient's inbox has no such sandbox — a malformed
 * body is what they see.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Single-pass token substitution. Builds one RegExp that matches any
 * `{{keyName}}` placeholder present in the tokens map, then walks the source
 * with String.replace so no token value can re-expand into another token —
 * e.g., if firstName were ever "{{claimUrl}}", sequential replaceAll would
 * re-substitute it on the next iteration. Single-pass eliminates that
 * attack/accident surface.
 *
 * Keys are regex-escaped defensively. In practice token names are
 * lowerCamelCase word characters, but the escape keeps the contract safe
 * for future additions.
 */
function substitute(
  source: string,
  tokens: Record<string, string>,
  format: 'html' | 'text'
): string {
  const keys = Object.keys(tokens);
  if (keys.length === 0) return source;
  const escapedKeys = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\{\\{(${escapedKeys.join('|')})\\}\\}`, 'g');
  return source.replace(pattern, (_match, key: string) => {
    const value = tokens[key] ?? '';
    return format === 'html' ? escapeHtml(value) : value;
  });
}

/**
 * Render the VIT ID invitation email for a specific appointee.
 * Throws TemplateRenderError('missing_first_name') when firstName is
 * blank — the route layer maps that to a structured UI error rather
 * than silently sending "Dear ," (which was the prior pre-MJML path
 * for bio, never for VIT since VIT is new).
 */
export function renderVitIdInvitation(args: {
  firstName: string;
}): RenderedEmail {
  const firstName = (args.firstName ?? '').trim();
  if (!firstName) {
    throw new TemplateRenderError('missing_first_name');
  }

  const { vitIdHtml, vitIdText } = loadTemplates();
  const tokens = {
    firstName,
    claimUrl: env.CLAIM_VIT_ID_URL,
    logoUrl: buildLogoUrl(),
  };

  return {
    subject: 'Welcome to I Tatti — Claim your VIT ID',
    html: substitute(vitIdHtml, tokens, 'html'),
    text: substitute(vitIdText, tokens, 'text'),
  };
}

/**
 * Render the bio & project description email. Unlike VIT invitation, a
 * missing firstName falls back to "Appointee" — preserves the behavior
 * from the prior plaintext path (sendBioProjectDescriptionEmail at
 * email.service.ts pre-migration).
 */
export function renderBioProjectDescription(args: {
  firstName: string;
}): RenderedEmail {
  const firstName = (args.firstName ?? '').trim() || 'Appointee';

  const { bioHtml, bioText } = loadTemplates();
  const tokens = {
    firstName,
    logoUrl: buildLogoUrl(),
  };

  return {
    subject: 'Biography and Project Description',
    html: substitute(bioHtml, tokens, 'html'),
    text: substitute(bioText, tokens, 'text'),
  };
}
