import { useCallback } from 'react';
import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import { Outlet, useNavigate } from 'react-router';
import { auth0Config } from '@/config/auth0';
import { getSafeReturnTo } from '@/config/auth-redirect';
import { getRuntimeConfig } from '@/config/runtime';
import { DevAuthProvider } from './DevAuthProvider';

export function AuthProviderBoundary() {
  const navigate = useNavigate();
  const onRedirectCallback = useCallback(
    (appState?: AppState) => {
      void navigate(getSafeReturnTo(appState?.returnTo), { replace: true });
    },
    [navigate]
  );
  const content = <Outlet />;

  if (getRuntimeConfig().devSkipAuth) {
    return <DevAuthProvider>{content}</DevAuthProvider>;
  }

  return (
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      // Renew via refresh token, not a hidden iframe: Safari ITP (and
      // increasingly Chrome) blocks the third-party cookie the iframe needs, so
      // mid-session renewal used to throw login_required and every query failed.
      // cacheLocation stays 'memory' on purpose — tokens must never be written
      // to localStorage.
      useRefreshTokens
      cacheLocation="memory"
      authorizationParams={{
        redirect_uri: auth0Config.callbackUrl,
        audience: auth0Config.audience,
        scope: 'openid profile email offline_access',
      }}
      onRedirectCallback={onRedirectCallback}
    >
      {content}
    </Auth0Provider>
  );
}
