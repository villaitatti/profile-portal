import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export function AuthenticationGuard() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const location = useLocation();
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      void loginWithRedirect({ appState: { returnTo } }).catch(() => {
        setRedirectError('Unable to start sign-in. Please try again.');
      });
    }
  }, [isAuthenticated, isLoading, location.hash, location.pathname, location.search, loginWithRedirect]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    if (redirectError) {
      return (
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">Sign-in unavailable</h1>
          <p className="text-muted-foreground">{redirectError}</p>
          <button
            type="button"
            className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => {
              setRedirectError(null);
              const returnTo = `${location.pathname}${location.search}${location.hash}`;
              void loginWithRedirect({ appState: { returnTo } }).catch(() => {
                setRedirectError('Unable to start sign-in. Please try again.');
              });
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return <LoadingSpinner />;
  }

  return <Outlet />;
}
