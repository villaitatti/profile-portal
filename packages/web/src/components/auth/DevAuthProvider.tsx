import { type ReactNode } from 'react';
import { Auth0Context } from '@auth0/auth0-react';
import { auth0Config } from '@/config/auth0';

/**
 * Mock Auth0 provider for local development without real Auth0 credentials.
 * Activated by PUBLIC_DEV_SKIP_AUTH=true or the local Vite fallback flag.
 *
 * Provides the same context shape as Auth0Provider so all useAuth0() calls
 * work seamlessly throughout the app.
 */

const mockContextValue = {
  isAuthenticated: true,
  isLoading: false,
  loginWithRedirect: async () => {},
  logout: () => {
    console.log('[Dev Mode] Logout called — no-op in dev mode');
  },
  getAccessTokenSilently: async () => 'dev-mock-token',
  getAccessTokenWithPopup: async () => 'dev-mock-token',
  getIdTokenClaims: async () => undefined,
  loginWithPopup: async () => {},
  handleRedirectCallback: async () => ({ appState: undefined }),
  error: undefined,
};

function getMockUser() {
  const namespace = auth0Config.namespace;
  return {
    sub: 'dev|12345',
    email: 'dev@itatti.harvard.edu',
    name: 'Dev User',
    given_name: 'Dev',
    family_name: 'User',
    picture: undefined,
    [`${namespace}/roles`]: ['fellows', 'fellows-current', 'staff-IT'],
    [`${namespace}/app_metadata`]: { civicrm_id: '99999' },
  };
}

export function DevAuthProvider({ children }: { children: ReactNode }) {
  return (
    // @ts-expect-error — mock context doesn't perfectly match Auth0 internals
    <Auth0Context.Provider value={{ ...mockContextValue, user: getMockUser() }}>
      {children}
    </Auth0Context.Provider>
  );
}
