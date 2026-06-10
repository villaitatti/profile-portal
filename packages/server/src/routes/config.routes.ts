import { Router } from 'express';
import { env } from '../env.js';

function fromEnv(primary: string | undefined, legacyViteName: string, fallback = '') {
  return primary !== undefined && primary !== ''
    ? primary
    : process.env[legacyViteName] ?? fallback;
}

function defaultCallbackUrl() {
  return env.PORTAL_PUBLIC_URL ? `${env.PORTAL_PUBLIC_URL.replace(/\/$/, '')}/callback` : '';
}

export function getPublicConfig() {
  return {
    auth0Domain: fromEnv(env.PUBLIC_AUTH0_DOMAIN, 'VITE_AUTH0_DOMAIN', env.AUTH0_DOMAIN),
    auth0ClientId: fromEnv(env.PUBLIC_AUTH0_CLIENT_ID, 'VITE_AUTH0_CLIENT_ID'),
    auth0Audience: fromEnv(env.PUBLIC_AUTH0_AUDIENCE, 'VITE_AUTH0_AUDIENCE', env.AUTH0_AUDIENCE),
    auth0CallbackUrl: fromEnv(
      env.PUBLIC_AUTH0_CALLBACK_URL,
      'VITE_AUTH0_CALLBACK_URL',
      defaultCallbackUrl()
    ),
    auth0Namespace: fromEnv(
      env.PUBLIC_AUTH0_NAMESPACE,
      'VITE_AUTH0_NAMESPACE',
      'https://auth0.itatti.harvard.edu'
    ),
    apiBaseUrl: fromEnv(env.PUBLIC_API_BASE_URL, 'VITE_API_BASE_URL'),
    civicrmUrl: fromEnv(env.PUBLIC_CIVICRM_URL, 'VITE_CIVICRM_URL'),
    devSkipAuth: env.PUBLIC_DEV_SKIP_AUTH || process.env.VITE_DEV_SKIP_AUTH === 'true',
  };
}

export const configRoutes = Router();

configRoutes.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getPublicConfig());
});
