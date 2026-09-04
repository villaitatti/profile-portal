import { Outlet, useLocation } from 'react-router';
import { Languages, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ItattiLogo } from '@/components/shared/ItattiLogo';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { persistLanguage } from '@/i18n/config';
import { Button } from '@/components/ui/button';

export function PublicLayout() {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const isFormRoute = location.pathname.startsWith('/forms/');

  const toggleLanguage = () => {
    const next = i18n.language === 'it' ? 'en' : 'it';
    void i18n.changeLanguage(next);
    persistLanguage(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 sm:gap-4 sm:px-6">
        <ItattiLogo className="h-6 w-auto shrink-0 text-foreground sm:h-7" />
        <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
        {/* min-w-0 + truncate: on a phone the wordmark, title and controls
            share ~375px, so the title is the part allowed to give way. */}
        <span className="min-w-0 truncate font-heading text-[1.15rem] text-foreground">
          {t('common.appName')}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" type="button" onClick={toggleLanguage}>
            <Languages />
            <span>{i18n.language.toUpperCase()}</span>
          </Button>
          <Button
            variant="icon-action"
            size="icon"
            type="button"
            aria-label={theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <main className={cn('mx-auto py-12 px-6', isFormRoute ? 'max-w-5xl' : 'max-w-2xl')}>
        <Outlet />
      </main>
    </div>
  );
}
