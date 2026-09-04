import { useAuth0 } from '@auth0/auth0-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export function AuthenticationGuard() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const location = useLocation();
  const [redirectFailed, setRedirectFailed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      void loginWithRedirect({ appState: { returnTo } }).catch(() => {
        setRedirectFailed(true);
      });
    }
  }, [isAuthenticated, isLoading, location.hash, location.pathname, location.search, loginWithRedirect]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    if (redirectFailed) {
      return (
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="mb-2 font-heading text-[1.8rem] leading-tight">{t('auth.unavailableTitle')}</h1>
          <p className="text-muted-foreground">{t('auth.startFailed')}</p>
          <Button
            type="button"
            size="lg"
            className="mt-6"
            onClick={() => {
              setRedirectFailed(false);
              const returnTo = `${location.pathname}${location.search}${location.hash}`;
              void loginWithRedirect({ appState: { returnTo } }).catch(() => {
                setRedirectFailed(true);
              });
            }}
          >
            {t('auth.tryAgain')}
          </Button>
        </div>
      );
    }
    return <LoadingSpinner />;
  }

  return <Outlet />;
}
