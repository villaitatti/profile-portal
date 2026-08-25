// Public VIT ID claim page (ClaimPage, ClaimForm, ClaimHelpForm). Keys are
// referenced as t('claim.<key>').
export const claim = {
  en: {
    welcomeTitle: 'Welcome to I Tatti',
    welcomeIntro:
      "Your VIT ID is your personal credential for I Tatti's digital services — email, cloud storage, internal tools, and more. Current fellows, visiting scholars, and appointees are eligible.",
    or: 'or',
    form: {
      title: 'Claim your VIT ID',
      description:
        'Enter your email address to check your eligibility and receive your VIT ID credentials.',
      emailLabel: 'Email address',
      emailPlaceholder: 'you@example.com',
      submit: 'Claim VIT ID',
      processing: 'Processing...',
      unreachable: "We couldn't reach the server — check your connection and try again.",
      submittedTitle: 'Request Submitted',
      submittedBody:
        "If you are eligible, you'll receive an email with your login credentials within a few minutes. Check your spam folder if you don't see it.",
    },
    help: {
      title: 'Need help?',
      description:
        'If you cannot claim your VIT ID automatically, fill out this form and our team will assist you.',
      fullNameLabel: 'Full name',
      contactEmailLabel: 'Contact email',
      fellowshipYearLabel: 'Fellowship year',
      messageLabel: 'Message',
      optional: '(optional)',
      submit: 'Submit Help Request',
      submitting: 'Submitting...',
      errorPrefix: 'Something went wrong. Please try again, or contact IT directly at',
      submittedTitle: 'Request Submitted',
      submittedBody:
        'Your request has been submitted. Our team will follow up at the email address provided.',
    },
    errors: {
      emailInvalid: 'Please enter a valid email address',
      nameRequired: 'Name is required',
      fellowshipYearFormat: 'Format: YYYY-YYYY (e.g., 2024-2025)',
      messageTooLong: 'Message must be at most 2000 characters',
    },
  },
  it: {
    welcomeTitle: 'Benvenuti a I Tatti',
    welcomeIntro:
      'Il VIT ID è la tua credenziale personale per i servizi digitali di I Tatti — email, archiviazione cloud, strumenti interni e altro. Sono idonei i fellow attuali, gli studiosi in visita e i titolari di incarico.',
    or: 'oppure',
    form: {
      title: 'Richiedi il tuo VIT ID',
      description:
        "Inserisci il tuo indirizzo email per verificare l'idoneità e ricevere le credenziali del tuo VIT ID.",
      emailLabel: 'Indirizzo email',
      emailPlaceholder: 'nome@esempio.com',
      submit: 'Richiedi VIT ID',
      processing: 'Elaborazione in corso…',
      unreachable: 'Impossibile raggiungere il server: controlla la connessione e riprova.',
      submittedTitle: 'Richiesta inviata',
      submittedBody:
        "Se sei idoneo, riceverai entro pochi minuti un'email con le tue credenziali di accesso. Se non la vedi, controlla la cartella spam.",
    },
    help: {
      title: 'Hai bisogno di aiuto?',
      description:
        'Se non riesci a richiedere il tuo VIT ID automaticamente, compila questo modulo e il nostro team ti assisterà.',
      fullNameLabel: 'Nome e cognome',
      contactEmailLabel: 'Email di contatto',
      fellowshipYearLabel: 'Anno di fellowship',
      messageLabel: 'Messaggio',
      optional: '(facoltativo)',
      submit: 'Invia richiesta di assistenza',
      submitting: 'Invio in corso…',
      errorPrefix:
        "Si è verificato un errore. Riprova, oppure contatta direttamente l'IT all'indirizzo",
      submittedTitle: 'Richiesta inviata',
      submittedBody:
        "La tua richiesta è stata inviata. Il nostro team ti ricontatterà all'indirizzo email indicato.",
    },
    errors: {
      emailInvalid: 'Inserisci un indirizzo email valido',
      nameRequired: 'Il nome è obbligatorio',
      fellowshipYearFormat: 'Formato: AAAA-AAAA (es. 2024-2025)',
      messageTooLong: 'Il messaggio non può superare i 2000 caratteri',
    },
  },
};
