import { useCallback } from 'react';
import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import { Outlet, useNavigate } from 'react-router-dom';
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
      authorizationParams={{
        redirect_uri: auth0Config.callbackUrl,
        audience: auth0Config.audience,
        scope: 'openid profile email',
      }}
      onRedirectCallback={onRedirectCallback}
    >
      {content}
    </Auth0Provider>
  );
}
