import { z } from 'zod';

const devMode = process.env.DEV_SKIP_EXTERNAL_SERVICES === 'true';

const requiredStr = devMode ? z.string().default('') : z.string().min(1);
const requiredUrl = devMode ? z.string().default('http://localhost') : z.string().url();
const requiredEmail = devMode ? z.string().default('dev@localhost') : z.string().email();

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

  // Database
  DATABASE_URL: z.string().min(1),

  // CORS — required in production, optional in development
  CORS_ORIGIN: z.string().optional(),

  // Auth0 - JWT verification
  AUTH0_DOMAIN: requiredStr,
  AUTH0_AUDIENCE: requiredStr,

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
  // never accidentally fire it; production must opt in explicitly.
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

  // VIT ID claim page URL — interpolated into the VIT ID invitation email.
  // Single URL, required when SES is configured. Server fails fast if unset
  // under production unless DEV_SKIP_EXTERNAL_SERVICES=true.
  // HTTPS is enforced in production (see loadEnv() below).
  CLAIM_VIT_ID_URL: requiredUrl,
  // Public-facing URL of the profile-portal web app. Used to construct
  // absolute URLs for assets referenced from outgoing email (e.g., the
  // I Tatti logo header at ${PORTAL_PUBLIC_URL}/itatti-logo-email.png).
  // HTTPS is enforced in production (see loadEnv() below).
  PORTAL_PUBLIC_URL: requiredUrl,
  // Friendly "From" names rendered in the recipient's inbox for each
  // appointee-facing email type. Defaults match the sender-identity
  // decisions from /plan-design-review 2026-04-22.
  APPOINTEE_EMAIL_FROM_NAME_VIT_ID: z.string().min(1).default('I Tatti - VIT ID'),
  APPOINTEE_EMAIL_FROM_NAME_BIO: z.string().min(1).default('I Tatti - Bio & Project'),
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

  // CORS_ORIGIN is required in production to prevent wildcard access
  if (result.data.NODE_ENV === 'production' && !result.data.CORS_ORIGIN) {
    console.error('CORS_ORIGIN is required in production mode.');
    console.error('Set CORS_ORIGIN to the frontend URL (e.g. https://dev.profile.itatti.net)');
    process.exit(1);
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
    for (const key of ['CLAIM_VIT_ID_URL', 'PORTAL_PUBLIC_URL'] as const) {
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
