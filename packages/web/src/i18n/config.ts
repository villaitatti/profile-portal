import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { common } from './resources/common';
import { nav } from './resources/nav';
import { dashboard } from './resources/dashboard';
import { profile } from './resources/profile';
import { claim } from './resources/claim';
import { forms } from './resources/forms';
import { auth } from './resources/auth';
import { admin } from './resources/admin';
import { fellows } from './resources/fellows';

export type AppLanguage = 'en' | 'it';

const STORAGE_KEY = 'profile-portal:lang';

function initialLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'it') return stored;
  } catch {
    // Storage can be unavailable (private mode); fall through to the default.
  }
  return 'en';
}

export function persistLanguage(lang: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-persistent storage still leaves the in-session language working.
  }
}

const resources = {
  en: {
    translation: {
      common: common.en,
      nav: nav.en,
      dashboard: dashboard.en,
      profile: profile.en,
      claim: claim.en,
      forms: forms.en,
      auth: auth.en,
      admin: admin.en,
      fellows: fellows.en,
    },
  },
  it: {
    translation: {
      common: common.it,
      nav: nav.it,
      dashboard: dashboard.it,
      profile: profile.it,
      claim: claim.it,
      forms: forms.it,
      auth: auth.it,
      admin: admin.it,
      fellows: fellows.it,
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Keep <html lang> in sync so screen readers, spellcheck, and browser
// translation treat the page as the active language (index.html ships lang="en").
function syncDocumentLanguage(lang: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
syncDocumentLanguage(i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
