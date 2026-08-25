import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'profile-portal:theme';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Storage can be unavailable (private mode); fall through to the OS preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Light/dark theme state. The `.dark` class on <html> drives both the token
 * overrides in app.css and Tailwind's `dark:` variant; index.html applies the
 * class before first paint so there is no flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Persist only explicit choices: writing the OS-derived value on mount would
  // pin the theme forever and stop it following the system preference.
  const toggleTheme = useCallback(
    () =>
      setTheme((current) => {
        const next = current === 'dark' ? 'light' : 'dark';
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Non-persistent storage still leaves the in-session theme working.
        }
        return next;
      }),
    []
  );

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.');
  return context;
}
