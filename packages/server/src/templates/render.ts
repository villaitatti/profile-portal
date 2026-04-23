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

function substitute(source: string, tokens: Record<string, string>): string {
  let out = source;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
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
    html: substitute(vitIdHtml, tokens),
    text: substitute(vitIdText, tokens),
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
    html: substitute(bioHtml, tokens),
    text: substitute(bioText, tokens),
  };
}
