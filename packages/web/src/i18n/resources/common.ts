// Generic UI strings shared across pages: actions, empty/loading states, and
// the app chrome (header, sidebar footer). Page-specific strings live in the
// sibling per-area modules.
export const common = {
  en: {
    appName: 'Profile Portal',
    productEyebrow: 'Your I Tatti account',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    retry: 'Retry',
    loading: 'Loading…',
    search: 'Search',
    noResults: 'No results found',
    noItems: 'No items found',
    clearSelection: 'Clear selection',
    signOut: 'Sign out',
    toggleSidebar: 'Toggle sidebar',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    language: 'Language',
    none: 'None',
    yes: 'Yes',
    no: 'No',
    sidebar: 'Sidebar',
    mobileSidebarDescription: 'Displays the mobile sidebar.',
    searchIn: 'Search {{target}}...',
    createNew: 'Create new: “{{value}}”',
    // Router-level error boundary (src/config/routes.tsx), shown e.g. when a
    // lazy route chunk fails to load after a redeploy.
    routeError: {
      title: 'Page temporarily unavailable',
      description: 'This page could not be loaded. Reload to fetch the latest application files.',
      reload: 'Reload page',
    },
    // Catch-all route for addresses that do not exist (src/pages/NotFoundPage.tsx).
    notFound: {
      title: 'Page not found',
      description: 'There is no page at this address. Check the link, or go back to the dashboard.',
      goToDashboard: 'Go to the dashboard',
    },
    // Generic user-safe error messages (src/lib/errors.ts). Shown when the
    // real failure is technical — network, server fault, expired session —
    // and the raw detail belongs in the console, not on screen.
    errors: {
      network: 'The server could not be reached. Check your internet connection and try again.',
      server:
        'Something went wrong while processing the request. Try again in a moment; if the problem continues, contact IT.',
      sessionExpired: 'Your session has expired. Sign in again and retry.',
      notAllowed: 'Your account is not allowed to perform this action. If you think it should be, contact IT.',
      unexpected: 'An unexpected error occurred. Please try again.',
    },
  },
  it: {
    appName: 'Profile Portal',
    productEyebrow: 'Il tuo account I Tatti',
    save: 'Salva',
    cancel: 'Annulla',
    confirm: 'Conferma',
    close: 'Chiudi',
    delete: 'Elimina',
    edit: 'Modifica',
    add: 'Aggiungi',
    retry: 'Riprova',
    loading: 'Caricamento…',
    search: 'Cerca',
    noResults: 'Nessun risultato trovato',
    noItems: 'Nessun elemento trovato',
    clearSelection: 'Deseleziona',
    signOut: 'Esci',
    toggleSidebar: 'Mostra/nascondi barra laterale',
    switchToLight: 'Passa al tema chiaro',
    switchToDark: 'Passa al tema scuro',
    lightMode: 'Tema chiaro',
    darkMode: 'Tema scuro',
    language: 'Lingua',
    none: 'Nessuno',
    yes: 'Sì',
    no: 'No',
    sidebar: 'Barra laterale',
    mobileSidebarDescription: 'Mostra la barra laterale mobile.',
    searchIn: 'Cerca {{target}}...',
    createNew: 'Crea nuovo: “{{value}}”',
    routeError: {
      title: 'Pagina temporaneamente non disponibile',
      description:
        'Non è stato possibile caricare questa pagina. Ricarica per scaricare i file più recenti dell’applicazione.',
      reload: 'Ricarica la pagina',
    },
    notFound: {
      title: 'Pagina non trovata',
      description:
        'Non esiste alcuna pagina a questo indirizzo. Controlla il link oppure torna alla dashboard.',
      goToDashboard: 'Vai alla dashboard',
    },
    errors: {
      network: 'Impossibile raggiungere il server. Controlla la connessione a internet e riprova.',
      server:
        'Si è verificato un problema durante l’elaborazione della richiesta. Riprova tra qualche istante; se il problema persiste, contatta l’IT.',
      sessionExpired: 'La sessione è scaduta. Accedi di nuovo e riprova.',
      notAllowed:
        'Il tuo account non è autorizzato a eseguire questa operazione. Se ritieni che dovrebbe esserlo, contatta l’IT.',
      unexpected: 'Si è verificato un errore imprevisto. Riprova.',
    },
  },
};
