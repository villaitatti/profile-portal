import { Router } from 'express';
import {
  renderVitIdInvitation,
  renderBioProjectDescription,
  TemplateRenderError,
} from '../../templates/render.js';
import { logger } from '../../lib/logger.js';

/**
 * Dev-only preview routes for the MJML-compiled email templates. Renders the
 * HTML with placeholder variable values and returns it inline so a developer
 * can visit:
 *
 *   GET /__dev__/email-preview/vit-id-invitation?firstName=Sofia
 *   GET /__dev__/email-preview/bio-project-description?firstName=Marco
 *
 * ...and see the same HTML the EmailPreviewModal will render, WITHOUT needing
 * CiviCRM, Auth0, or the fellows-admin auth chain. Saves hours of iteration
 * when tweaking the MJML.
 *
 * Mount is gated in routes/index.ts on NODE_ENV !== 'production'; these
 * handlers never run in prod, and are not protected by auth.
 */
export const devEmailPreviewRoutes = Router();

/**
 * Coerce an Express query param that might be undefined, a string, an array,
 * or a ParsedQs into a plain string. Express gives us `string | string[] |
 * ParsedQs | ParsedQs[]` via typing; `?firstName=a&firstName=b` arrives as
 * an array at runtime. Pick the first element and cast to string; anything
 * falsy falls back to the default.
 */
function firstQueryValue(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null) return fallback;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first !== undefined && first !== null ? String(first) : fallback;
  }
  return String(raw) || fallback;
}

devEmailPreviewRoutes.get('/vit-id-invitation', (req, res) => {
  const firstName = firstQueryValue(req.query.firstName, 'Sofia');
  try {
    const rendered = renderVitIdInvitation({ firstName });
    res.set('Content-Type', 'text/html; charset=utf-8').send(rendered.html);
  } catch (err) {
    if (err instanceof TemplateRenderError) {
      // Render reason codes from a safe static map so future additions to the
      // reason union can't silently become an XSS sink. This is a dev-only
      // route, but treating the render as trusted-output would be a footgun
      // if it ever got promoted.
      const reasonCopy: Record<string, string> = {
        missing_first_name: 'Template requires a firstName — pass ?firstName=YourName in the query string.',
      };
      const message = reasonCopy[err.reason] ?? 'Template render failed.';
      res.status(400).send(`<h1>Template render error</h1><p>${message}</p>`);
      return;
    }
    logger.error({ err }, 'Dev email preview: VIT ID invitation render failed');
    res.status(500).send('<h1>Internal error</h1>');
  }
});

devEmailPreviewRoutes.get('/bio-project-description', (req, res) => {
  const firstName = firstQueryValue(req.query.firstName, 'Marco');
  try {
    const rendered = renderBioProjectDescription({ firstName });
    res.set('Content-Type', 'text/html; charset=utf-8').send(rendered.html);
  } catch (err) {
    logger.error({ err }, 'Dev email preview: bio email render failed');
    res.status(500).send('<h1>Internal error</h1>');
  }
});

// Index page — discoverable if someone opens /__dev__/email-preview without a
// specific template. Lists each available preview with links.
devEmailPreviewRoutes.get('/', (_req, res) => {
  const html = `<!doctype html>
<html>
<head><title>Email previews (dev only)</title>
<style>body{font-family:Georgia,serif;max-width:640px;margin:48px auto;padding:0 24px;color:#1d252c}a{color:#ab192d}li{margin:8px 0}</style>
</head>
<body>
<h1>Email previews</h1>
<p>Dev-only renders of the compiled MJML templates. Append <code>?firstName=SomeName</code> to change the substitution.</p>
<ul>
  <li><a href="./vit-id-invitation">VIT ID invitation</a></li>
  <li><a href="./bio-project-description">Bio & project description</a></li>
</ul>
<p><em>These routes are disabled in production.</em></p>
</body></html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});
