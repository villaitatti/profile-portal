import { z } from 'zod';

const devMode = process.env.DEV_SKIP_EXTERNAL_SERVICES === 'true';

const requiredStr = devMode ? z.string().default('') : z.string().min(1);
const requiredUrl = devMode ? z.string().default('http://localhost') : z.string().url();
const requiredEmail = devMode ? z.string().default('dev@localhost') : z.string().email();

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
  JIRA_BASE_URL: z.string().url().optional(),
  JIRA_EMAIL: z.string().email().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_SERVICE_DESK_ID: z.string().optional(),
  JIRA_REQUEST_TYPE_ID: z.string().optional(),

  // Atlassian SCIM provisioning (optional — sync disabled if not configured)
  ATLASSIAN_SCIM_BASE_URL: z.string().url().optional(),
  ATLASSIAN_SCIM_DIRECTORY_ID: z.string().optional(),
  ATLASSIAN_SCIM_BEARER_TOKEN: z.string().optional(),

  // Auth0 - Fellows current role (Phase 2)
  AUTH0_FELLOWS_CURRENT_ROLE_ID: z.string().optional(),

  // Atlassian JSM Organizations (Phase 2 — optional, org features disabled if not configured)
  ATLASSIAN_JSM_SITE1_URL: z.string().url().optional(),
  ATLASSIAN_JSM_SITE2_URL: z.string().url().optional(),
  ATLASSIAN_JSM_SITE1_FORMER_ORG_ID: z.string().optional(),
  ATLASSIAN_JSM_SITE1_CURRENT_ORG_ID: z.string().optional(),
  ATLASSIAN_JSM_SITE2_FORMER_ORG_ID: z.string().optional(),
  ATLASSIAN_JSM_SITE2_CURRENT_ORG_ID: z.string().optional(),

  // AWS SES (Phase 2 — optional, email notifications disabled if not configured)
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_FROM_EMAIL: z.string().email().optional().or(z.literal('')),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional().or(z.literal('')),
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

  return result.data;
}

export const env = loadEnv();
export const isDevMode = devMode;
export type Env = z.infer<typeof envSchema>;
