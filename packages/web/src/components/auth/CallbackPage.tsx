import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

/**
 * Auth0 redirect landing page.
 *
 * Lives in its own module so `@auth0/auth0-react` stays out of the app shell
 * chunk (see the route table) and so the three terminal states are explicit:
 *
 *   error            → Auth0 refused (access_denied, invalid/expired state)
 *   authenticated    → onRedirectCallback is navigating away; hold the spinner
 *   neither          → no code/state in the URL (refresh or bookmark of
 *                      /callback). This route sits outside AuthenticationGuard,
 *                      so nothing else would ever start a login here.
 *
 * The Auth0 error detail (`error_description`, raw message) is technical,
 * English-only text — it goes to the console for IT, never on screen.
 */
export function CallbackPage() {
  const { t } = useTranslation();
  const { error, isLoading, isAuthenticated, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (error) {
      console.error(
        '[auth] Auth0 callback error',
        (error as { error_description?: unknown }).error_description ?? error.message,
        error
      );
    }
  }, [error]);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="mb-2 font-heading text-[1.8rem] leading-tight">{t('auth.callbackErrorTitle')}</h1>
        <p className="text-muted-foreground">{t('auth.callbackErrorBody')}</p>
        <Button type="button" size="lg" className="mt-6" onClick={() => void loginWithRedirect()}>
          {t('auth.returnToSignIn')}
        </Button>
      </div>
    );
  }

  if (isLoading || isAuthenticated) {
    return <LoadingSpinner />;
  }

  return <Navigate to="/dashboard" replace />;
}
