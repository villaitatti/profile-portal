export const auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || '',
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || '',
  audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
  callbackUrl: import.meta.env.VITE_AUTH0_CALLBACK_URL || window.location.origin + '/callback',
  namespace: import.meta.env.VITE_AUTH0_NAMESPACE || 'https://auth0.itatti.harvard.edu',
};
