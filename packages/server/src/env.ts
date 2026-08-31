import { z } from 'zod';
import { validateSseSecret } from './lib/sse-secret.js';

const devMode = process.env.DEV_SKIP_EXTERNAL_SERVICES === 'true';

const requiredStr = devMode ? z.string().default('') : z.string().min(1);
const requiredUrl = devMode ? z.string().default('http://localhost') : z.string().url();

// Parses a "true"/"false" env var, tolerating unset and empty-string values
// (both treated as the default). `.default()` alone doesn't catch empty strings
// because dotenv sets `APPOINTEE_FOO=` → `process.env.APPOINTEE_FOO === ""`,
// not `undefined`. The `.or(z.literal(''))` ensures those fall through cleanly.
const booleanFlag = (defaultValue: 'true' | 'false' = 'false') =>
  z
    .enum(['true', 'false'])
    .or(z.literal(''))
    .default(defaultValue)
    .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DEV_SKIP_EXTERNAL_SERVICES: z.string().optional(),

  // Number of reverse-proxy hops in front of the server (cloudflared = 1).
  // Validated here so a typo'd value fails the boot instead of silently
  // becoming NaN in `app.set('trust proxy', …)` — which would break client-IP
  // resolution and every rate limiter keyed on it. Empty string (dotenv
  // `TRUST_PROXY_HOPS=`) falls through to the default rather than coercing to 0.
  TRUST_PROXY_HOPS: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).default(1)
  ),

  // Pino log level. lib/logger.ts deliberately reads process.env directly (see
  // the comment there — the logger must not depend on env-module load order);
  // declaring it here means a typo'd level still fails the boot loudly instead
  // of being silently ignored.
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .or(z.literal(''))
    .optional(),

  // Web dev-server variable that shares the root .env; the server reads it only
  // as a CSP fallback for the Auth0 domain in development (app.ts).
  VITE_AUTH0_DOMAIN: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1),

  // CORS — required in production, optional in development
  CORS_ORIGIN: z.string().optional(),

  // Auth0 - JWT verification
  AUTH0_DOMAIN: requiredStr,
  AUTH0_AUDIENCE: requiredStr,

  // Browser runtime config. These values are exposed by GET /api/config and
  // must not contain secrets. They let one Docker image run in dev and prod
  // with environment-specific settings supplied at container runtime.
  PUBLIC_AUTH0_DOMAIN: z.string().optional(),
  PUBLIC_AUTH0_CLIENT_ID: z.string().optional(),
  PUBLIC_AUTH0_AUDIENCE: z.string().optional(),
  PUBLIC_AUTH0_CALLBACK_URL: z.string().url().or(z.literal('')).optional(),
  PUBLIC_AUTH0_NAMESPACE: z.string().optional(),
  PUBLIC_API_BASE_URL: z.string().optional(),
  PUBLIC_CIVICRM_URL: z.string().url().or(z.literal('')).optional(),
  PUBLIC_DEV_SKIP_AUTH: booleanFlag(),

  // Auth0 - Management API (M2M)
  AUTH0_M2M_CLIENT_ID: requiredStr,
  AUTH0_M2M_CLIENT_SECRET: requiredStr,
  AUTH0_CONNECTION: z.string().default('Username-Password-Authentication'),
  AUTH0_FELLOWS_ROLE_ID: requiredStr,

  // CiviCRM
  CIVICRM_BASE_URL: requiredUrl,
  CIVICRM_API_KEY: requiredStr,
  CIVICRM_SITE_KEY: z.string().optional(),

  // CiviCRM field mapping
  CIVICRM_FELLOWSHIP_ENTITY: z.string().default('Custom_Fellowships'),
  CIVICRM_FIELD_START_DATE: z.string().default('Fellowship_Start_Date'),
  CIVICRM_FIELD_END_DATE: z.string().default('Fellowship_End_Date'),
  CIVICRM_FIELD_ACCEPTED: z.string().default('Fellowship_Accepted'),
  CIVICRM_FIELD_APPOINTMENT: z.string().default('Appointment'),
  CIVICRM_FIELD_FELLOWSHIP: z.string().default('Fellowship'),

  // Jira Service Management (optional — help form disabled if not configured)
  JIRA_BASE_URL: z.string().url().or(z.literal('')).optional(),
  JIRA_EMAIL: z.string().email().or(z.literal('')).optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_SERVICE_DESK_ID: z.string().optional(),
  JIRA_REQUEST_TYPE_ID: z.string().optional(),

  // Atlassian SCIM provisioning (optional — sync disabled if not configured)
  ATLASSIAN_SCIM_BASE_URL: z.string().url().or(z.literal('')).optional(),
  ATLASSIAN_SCIM_DIRECTORY_ID: z.string().optional(),
  ATLASSIAN_SCIM_BEARER_TOKEN: z.string().optional(),

  // Auth0 - Fellows current role (Phase 2)
  AUTH0_FELLOWS_CURRENT_ROLE_ID: z.string().optional(),

  // Scheduled automations — must be explicitly enabled per-deployment.
  // Only the true production instance should set this to 'true'; dev/staging
  // boxes running with NODE_ENV=production must leave it unset/false so the
  // July 1 + July 2 cron jobs don't fire against real Auth0/JSM/CiviCRM.
  // Gates ONLY the July automations — the daily bio-email dispatch has its own
  // independent flag (APPOINTEE_EMAIL_CRON_ENABLED below).
  AUTOMATIONS_ENABLED: booleanFlag(),

  // Atlassian JSM Organizations (Phase 2 — optional, org features disabled if not configured)
  ATLASSIAN_JSM_SITE1_URL: z.string().url().or(z.literal('')).optional(),
  ATLASSIAN_JSM_SITE2_URL: z.string().url().or(z.literal('')).optional(),
  ATLASSIAN_JSM_SITE1_FORMER_ORG_ID: z.string().optional(),
  ATLASSIAN_JSM_SITE1_CURRENT_ORG_ID: z.string().optional(),
  ATLASSIAN_JSM_SITE2_FORMER_ORG_ID: z.string().optional(),
  ATLASSIAN_JSM_SITE2_CURRENT_ORG_ID: z.string().optional(),

  // AWS SES (Phase 2 — optional, email notifications disabled if not configured)
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_FROM_EMAIL: z.string().email().optional().or(z.literal('')),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional().or(z.literal('')),

  // Appointee bio-and-project-description email workflow.
  // Cron dispatch (daily at 09:00 Europe/Rome). Defaults to false so dev/staging
  // never accidentally fire it; production must opt in explicitly. Independent
  // of AUTOMATIONS_ENABLED — enabling this alone is sufficient for dispatch.
  APPOINTEE_EMAIL_CRON_ENABLED: booleanFlag(),
  // Dev/staging safety valve. When set, ALL outgoing appointee bio emails are
  // redirected to this single address regardless of the intended recipient.
  // In production (NODE_ENV=production without DEV_SKIP_EXTERNAL_SERVICES),
  // this may only be set if APPOINTEE_EMAIL_ALLOW_REDIRECT is explicitly 'true'
  // — otherwise loadEnv() aborts startup. The dev server at civicrm-dev runs
  // with NODE_ENV=production and DOES need the redirect, so it opts in via
  // APPOINTEE_EMAIL_ALLOW_REDIRECT=true. Real production leaves both unset.
  APPOINTEE_EMAIL_REDIRECT_TO: z.string().email().optional().or(z.literal('')),
  APPOINTEE_EMAIL_ALLOW_REDIRECT: booleanFlag(),
  // Comma-separated list of addresses BCC'd on every outgoing appointee
  // email (Angela + Andrea, typically). Shared across bio & VIT ID invitation.
  // Empty disables BCC.
  APPOINTEE_EMAIL_BCC: z.string().optional(),
  // Reply-To for outgoing appointee email. AWS_SES_FROM_EMAIL is a no-reply
  // identity, so without this an appointee replying to the VIT ID invitation
  // reaches nobody. Optional — unset means no Reply-To header.
  APPOINTEE_EMAIL_REPLY_TO: z.string().email().optional().or(z.literal('')),

  // VIT ID claim page URL — interpolated into the VIT ID invitation email.
  // Single URL, required when SES is configured. Server fails fast if unset
  // under production unless DEV_SKIP_EXTERNAL_SERVICES=true.
  // HTTPS is enforced in production (see loadEnv() below).
  CLAIM_VIT_ID_URL: requiredUrl,
  // Public-facing URL of the profile-portal web app. Used to construct
  // fallback absolute URLs for assets referenced from outgoing email (e.g.,
  // the I Tatti logo header at ${PORTAL_PUBLIC_URL}/itatti-logo-email.png).
  // HTTPS is enforced in production (see loadEnv() below).
  PORTAL_PUBLIC_URL: requiredUrl,
  // Optional absolute logo URL for appointee emails. Use this when the portal
  // domain is protected by Cloudflare/Auth0 and email clients cannot fetch
  // ${PORTAL_PUBLIC_URL}/itatti-logo-email.png anonymously.
  APPOINTEE_EMAIL_LOGO_URL: z.string().url().optional().or(z.literal('')),
  // Friendly "From" names rendered in the recipient's inbox for each
  // appointee-facing email type. Defaults match the sender-identity
  // decisions from /plan-design-review 2026-04-22.
  APPOINTEE_EMAIL_FROM_NAME_VIT_ID: z.string().min(1).default('I Tatti - VIT ID'),
  APPOINTEE_EMAIL_FROM_NAME_BIO: z.string().min(1).default('I Tatti - Bio & Project'),

  // Form submission notifications — sent to VIT ID staff (not IT).
  // Required for form notification emails to be sent in production.
  FORM_NOTIFICATION_EMAIL: z.string().email().optional().or(z.literal('')),
  // Dev/staging override: when set, form notification emails go to this address
  // instead of FORM_NOTIFICATION_EMAIL, bypassing the dev-mode skip.
  // Allows testing the full email+PDF flow locally without touching production.
  FORM_NOTIFICATION_OVERRIDE_TO: z.string().email().optional().or(z.literal('')),
  // Public form bearer links expire even if an invitation is never submitted.
  // Resetting an invitation rotates the token and starts a fresh TTL.
  FORM_INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(180),

  // HMAC key for the short-lived SSE tokens that authorise the sync progress
  // stream (EventSource cannot send an Authorization header, so the token rides
  // in the query string instead of the JWT). Base64-encoded, >= 32 bytes.
  // Validated here rather than read straight from process.env so that a missing
  // value fails the process at boot like every other secret; previously
  // lib/sse-token.ts fell back to a per-process random key with only a
  // console.warn, which meant tokens silently stopped working across restarts.
  SSE_SECRET: z.string().optional(),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`
    );
    console.error('Missing or invalid environment variables:\n' + missing.join('\n'));
    console.error('\nCopy .env.example to .env and fill in the values.');
    console.error('Or set DEV_SKIP_EXTERNAL_SERVICES=true for local UI testing.');
    process.exit(1);
  }

  // Development auth replaces JWT verification with a fully privileged mock
  // user. Never allow either side of that switch in a production process: a
  // stale deployment variable would otherwise turn every protected endpoint
  // into an unauthenticated staff-IT endpoint.
  if (
    result.data.NODE_ENV === 'production' &&
    (devMode || result.data.PUBLIC_DEV_SKIP_AUTH || process.env.VITE_DEV_SKIP_AUTH === 'true')
  ) {
    console.error(
      'Development authentication must not be enabled in production. Unset ' +
        'DEV_SKIP_EXTERNAL_SERVICES, PUBLIC_DEV_SKIP_AUTH, and VITE_DEV_SKIP_AUTH.'
    );
    process.exit(1);
  }

  // CORS_ORIGIN is required in production to prevent wildcard access
  if (result.data.NODE_ENV === 'production' && !result.data.CORS_ORIGIN) {
    console.error('CORS_ORIGIN is required in production mode.');
    console.error('Set CORS_ORIGIN to the frontend URL (e.g. https://dev.profile.itatti.net)');
    process.exit(1);
  }

  // SSE_SECRET must be present and long enough in production. Fail closed here
  // rather than in lib/sse-token.ts, which used to warn and continue with an
  // ephemeral key — every container restart silently invalidated outstanding
  // tokens, breaking the sync progress stream with no actionable signal.
  if (result.data.NODE_ENV === 'production' && !devMode) {
    const secret = result.data.SSE_SECRET;
    if (!secret) {
      console.error('SSE_SECRET is required in production mode.');
      console.error(
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
      );
      process.exit(1);
    }
    // Same validator lib/sse-token.ts uses at load time, so the boot gate and
    // the runtime loader can never disagree about what counts as valid — and it
    // rejects malformed base64 rather than letting Buffer.from silently drop
    // invalid characters before the length check.
    const sseCheck = validateSseSecret(secret);
    if (!sseCheck.ok) {
      console.error(`SSE_SECRET is invalid: ${sseCheck.reason}.`);
      console.error(
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
      );
      process.exit(1);
    }
  }

  // APPOINTEE_EMAIL_REDIRECT_TO is a dev/staging-only safety valve. In
  // production (NODE_ENV=production without DEV_SKIP_EXTERNAL_SERVICES) we
  // refuse to start with it set UNLESS APPOINTEE_EMAIL_ALLOW_REDIRECT=true
  // has been explicitly set to acknowledge the override. This keeps real
  // production safe from an accidental leftover redirect config while still
  // allowing production-like dev/staging environments (e.g. the civicrm-dev
  // host, which also runs NODE_ENV=production) to opt in intentionally.
  // The guard uses the strict-checked `devMode` constant
  // (DEV_SKIP_EXTERNAL_SERVICES === 'true') so that the literal string
  // "false" cannot accidentally disable it.
  if (
    result.data.NODE_ENV === 'production' &&
    !devMode &&
    result.data.APPOINTEE_EMAIL_REDIRECT_TO &&
    !result.data.APPOINTEE_EMAIL_ALLOW_REDIRECT
  ) {
    console.error(
      'APPOINTEE_EMAIL_REDIRECT_TO is set in production but APPOINTEE_EMAIL_ALLOW_REDIRECT is not "true".\n' +
        'This guard prevents real appointee emails from being silently redirected to a developer inbox.\n' +
        'On real production: unset APPOINTEE_EMAIL_REDIRECT_TO.\n' +
        'On dev/staging (production-like): also set APPOINTEE_EMAIL_ALLOW_REDIRECT=true to acknowledge the override.'
    );
    process.exit(1);
  }

  // HTTPS enforcement for the two public-facing URLs that end up in
  // outbound email. In production we refuse http:// origins so a misconfig
  // can't send appointees a crimson "Claim your VIT ID" button that points
  // at a plain-http URL. Dev/staging can still use http://localhost etc.
  if (result.data.NODE_ENV === 'production' && !devMode) {
    for (const key of ['CLAIM_VIT_ID_URL', 'PORTAL_PUBLIC_URL', 'APPOINTEE_EMAIL_LOGO_URL'] as const) {
      const value = result.data[key];
      if (value && !value.startsWith('https://')) {
        console.error(
          `${key} must use https:// in production (got: ${value}). ` +
            'Appointees see these URLs in outbound email; shipping a plain-http ' +
            'link would be a security regression.'
        );
        process.exit(1);
      }
    }
  }

  return result.data;
}

export const env = loadEnv();
export const isDevMode = devMode;
export type Env = z.infer<typeof envSchema>;
