// Public fellowship form pages (PublicFormPage, PublicFormRenderer). Keys are
// referenced as t('forms.<key>'). Server-defined form content (section titles,
// field labels, options, help text) comes from the form definition and is NOT
// translated here — only the UI chrome around it.
export const forms = {
  en: {
    kicker: 'Fellowship form',
    submit: 'Submit form',
    submitting: 'Submitting...',
    tryAgain: 'Try again',
    tryingAgain: 'Trying again…',
    thankYouTitle: 'Thank you!',
    thankYouBody:
      'Your form has been submitted successfully. The I Tatti office will review your information. You may now close this window.',
    alreadySubmittedTitle: 'Form Already Submitted',
    // Trailing spaces are intentional: the sentence continues with contactForChanges.
    submittedOn: 'This form was submitted on {{date}}. ',
    alreadySubmittedBody: 'This form has already been submitted. ',
    contactForChanges:
      'If you need to make changes, please contact the I Tatti staff member who sent you this form.',
    expiredPrivacyBody:
      'For your privacy, this form link is no longer active. Please contact the I Tatti staff member who sent it to request a new link.',
    loadError: {
      expiredTitle: 'Form Link Expired',
      notFoundTitle: 'Form Not Found',
      rateLimitedTitle: 'Too Many Requests',
      unavailableTitle: 'Form Temporarily Unavailable',
      inactiveBody:
        'This link is no longer active. Please contact the I Tatti staff member who sent you this form.',
      rateLimitedBody: 'Please wait a few minutes before trying this form link again.',
      unavailableBody:
        'We could not load the form right now. Please check your connection and try again.',
    },
    validation: {
      required: 'This field is required',
      emailInvalid: 'Please enter a valid email address',
      dateMin: 'Date must be on or after {{date}}',
      dateMax: 'Date must be on or before {{date}}',
      dateFuture: 'Date cannot be in the future',
      summary_one: 'One answer needs your attention. Please review the highlighted field above.',
      summary_other:
        '{{count}} answers need your attention. Please review the highlighted fields above.',
    },
    submitError: {
      generic:
        'We could not submit your form right now. Your answers are still here — please check your connection and try again.',
    },
    leaveGuard: {
      title: 'Leave this form?',
      body: 'Your answers have not been submitted yet. If you leave this page, they will be lost.',
      stay: 'Stay on this page',
      leave: 'Leave page',
    },
    selectPlaceholder: 'Select...',
    noMatchingOptions: 'No matching options.',
    group: {
      addEntry: 'Add entry',
      entry: 'Entry',
      remove: 'Remove',
      removeItem: 'Remove {{item}} {{number}}',
      empty: 'No {{label}} added.',
      emptyNoLabel: 'No items added.',
    },
  },
  it: {
    kicker: 'Modulo di fellowship',
    submit: 'Invia modulo',
    submitting: 'Invio in corso…',
    tryAgain: 'Riprova',
    tryingAgain: 'Nuovo tentativo…',
    thankYouTitle: 'Grazie!',
    thankYouBody:
      "Il modulo è stato inviato correttamente. L'ufficio di I Tatti esaminerà le informazioni fornite. Ora puoi chiudere questa finestra.",
    alreadySubmittedTitle: 'Modulo già inviato',
    submittedOn: 'Questo modulo è stato inviato il {{date}}. ',
    alreadySubmittedBody: 'Questo modulo è già stato inviato. ',
    contactForChanges:
      'Se devi apportare modifiche, contatta il membro dello staff di I Tatti che ti ha inviato questo modulo.',
    expiredPrivacyBody:
      'Per tutelare la tua privacy, questo link non è più attivo. Contatta il membro dello staff di I Tatti che te lo ha inviato per richiederne uno nuovo.',
    loadError: {
      expiredTitle: 'Link del modulo scaduto',
      notFoundTitle: 'Modulo non trovato',
      rateLimitedTitle: 'Troppe richieste',
      unavailableTitle: 'Modulo temporaneamente non disponibile',
      inactiveBody:
        'Questo link non è più attivo. Contatta il membro dello staff di I Tatti che ti ha inviato questo modulo.',
      rateLimitedBody: 'Attendi qualche minuto prima di riprovare ad aprire questo link.',
      unavailableBody:
        'Non è stato possibile caricare il modulo. Controlla la connessione e riprova.',
    },
    validation: {
      required: 'Questo campo è obbligatorio',
      emailInvalid: 'Inserisci un indirizzo email valido',
      dateMin: 'La data deve essere il {{date}} o successiva',
      dateMax: 'La data deve essere il {{date}} o precedente',
      dateFuture: 'La data non può essere nel futuro',
      summary_one: 'Una risposta richiede la tua attenzione. Controlla il campo evidenziato qui sopra.',
      summary_other:
        '{{count}} risposte richiedono la tua attenzione. Controlla i campi evidenziati qui sopra.',
    },
    submitError: {
      generic:
        'Non è stato possibile inviare il modulo. Le tue risposte sono ancora qui: controlla la connessione e riprova.',
    },
    leaveGuard: {
      title: 'Vuoi lasciare questo modulo?',
      body: 'Le tue risposte non sono ancora state inviate. Se lasci questa pagina, andranno perse.',
      stay: 'Rimani sulla pagina',
      leave: 'Lascia la pagina',
    },
    selectPlaceholder: 'Seleziona…',
    noMatchingOptions: 'Nessuna opzione corrispondente.',
    group: {
      addEntry: 'Aggiungi voce',
      entry: 'Voce',
      remove: 'Rimuovi',
      removeItem: 'Rimuovi {{item}} {{number}}',
      empty: 'Nessuna voce aggiunta per {{label}}.',
      emptyNoLabel: 'Nessuna voce aggiunta.',
    },
  },
};
