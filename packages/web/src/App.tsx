import { Auth0Provider } from '@auth0/auth0-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { auth0Config } from '@/config/auth0';
import { queryClient } from '@/config/query-client';
import { router } from '@/config/routes';
import { DevAuthProvider } from '@/components/auth/DevAuthProvider';

const isDevMode = import.meta.env.VITE_DEV_SKIP_AUTH === 'true';

export default function App() {
  const content = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  if (isDevMode) {
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
      cacheLocation="localstorage"
    >
      {content}
    </Auth0Provider>
  );
}
