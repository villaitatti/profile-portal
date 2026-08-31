import { useAuth0 } from '@auth0/auth0-react';
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
 */
export function CallbackPage() {
  const { t } = useTranslation();
  const { error, isLoading, isAuthenticated, loginWithRedirect } = useAuth0();

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="mb-2 text-2xl font-bold">{t('auth.callbackErrorTitle')}</h1>
        <p className="text-muted-foreground">{describeAuthError(error) ?? t('auth.noErrorReason')}</p>
        <button
          type="button"
          className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={() => void loginWithRedirect()}
        >
          {t('auth.returnToSignIn')}
        </button>
      </div>
    );
  }

  if (isLoading || isAuthenticated) {
    return <LoadingSpinner />;
  }

  return <Navigate to="/dashboard" replace />;
}

/**
 * Auth0 puts the OAuth `error_description` on the thrown error, but only for
 * OAuthError; generic failures carry just a message. Returns null when neither
 * is present so the caller can show a localized fallback.
 */
function describeAuthError(error: Error): string | null {
  const description = (error as { error_description?: unknown }).error_description;
  if (typeof description === 'string' && description.trim() !== '') return description;
  if (error.message.trim() !== '') return error.message;
  return null;
}
