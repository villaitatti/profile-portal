import { type ReactNode } from 'react';
import { Auth0Context } from '@auth0/auth0-react';

/**
 * Mock Auth0 provider for local development without real Auth0 credentials.
 * Activated by VITE_DEV_SKIP_AUTH=true in .env
 *
 * Provides the same context shape as Auth0Provider so all useAuth0() calls
 * work seamlessly throughout the app.
 */

const AUTH0_NAMESPACE = import.meta.env.VITE_AUTH0_NAMESPACE || 'https://auth0.itatti.harvard.edu';

const mockUser = {
  sub: 'dev|12345',
  email: 'dev@itatti.harvard.edu',
  name: 'Dev User',
  given_name: 'Dev',
  family_name: 'User',
  picture: undefined,
  [`${AUTH0_NAMESPACE}/roles`]: ['fellows', 'fellows-current', 'staff-IT'],
  [`${AUTH0_NAMESPACE}/app_metadata`]: { civicrm_id: '99999' },
};

const mockContextValue = {
  isAuthenticated: true,
  isLoading: false,
  user: mockUser,
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

export function DevAuthProvider({ children }: { children: ReactNode }) {
  return (
    // @ts-expect-error — mock context doesn't perfectly match Auth0 internals
    <Auth0Context.Provider value={mockContextValue}>
      {children}
    </Auth0Context.Provider>
  );
}
