// Authentication surfaces (LoginButton, CallbackPage, AuthenticationGuard,
// RoleGuard). Keys are referenced as t('auth.<key>').
export const auth = {
  en: {
    signIn: 'Sign In',
    callbackErrorTitle: 'Sign-in could not be completed',
    returnToSignIn: 'Return to sign in',
    noErrorReason: 'The sign-in provider did not return a reason. Please try again.',
    unavailableTitle: 'Sign-in unavailable',
    startFailed: 'Unable to start sign-in. Please try again.',
    tryAgain: 'Try again',
    accessDeniedTitle: 'Access Denied',
    accessDeniedBody: 'You do not have permission to view this page.',
  },
  it: {
    signIn: 'Accedi',
    callbackErrorTitle: "Impossibile completare l'accesso",
    returnToSignIn: "Torna all'accesso",
    noErrorReason: 'Il provider di accesso non ha restituito un motivo. Riprova.',
    unavailableTitle: 'Accesso non disponibile',
    startFailed: "Impossibile avviare l'accesso. Riprova.",
    tryAgain: 'Riprova',
    accessDeniedTitle: 'Accesso negato',
    accessDeniedBody: 'Non disponi delle autorizzazioni necessarie per visualizzare questa pagina.',
  },
};
