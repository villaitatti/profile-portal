import { Languages, Moon, Sun } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ItattiLogo } from '@/components/shared/ItattiLogo';
import { navSections } from '@/config/navigation';
import { useTheme } from '@/lib/theme';
import { persistLanguage } from '@/i18n/config';

const navItems = navSections.flatMap((section) => section.items);

/**
 * The header carries three things: the sidebar toggle with the current
 * section's name, the I Tatti wordmark centred (the institutional anchor
 * shared with Libra), and the language/theme controls. Sign-out lives in the
 * sidebar footer next to the account it signs out.
 */
export function AppHeader() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();

  // Longest-prefix match so subroutes (/admin/apps/new) still name their section.
  const activeItem = navItems
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const toggleLanguage = () => {
    const next = i18n.language === 'it' ? 'en' : 'it';
    void i18n.changeLanguage(next);
    persistLanguage(next);
  };

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
      <Tooltip>
        <TooltipTrigger render={<SidebarTrigger aria-label={t('common.toggleSidebar')} />} />
        <TooltipContent side="bottom">
          {t('common.toggleSidebar')}{' '}
          <kbd className="rounded border border-background/30 px-1 font-sans text-[0.65rem]">
            ⌘B
          </kbd>
        </TooltipContent>
      </Tooltip>
      <div aria-hidden className="mr-1 h-4 w-px shrink-0 bg-border max-sm:hidden" />
      {/* The page repeats its own title as an h1, so this is a plain label. */}
      <p className="truncate text-[0.9rem] font-semibold text-ink-soft max-sm:hidden">
        {activeItem ? t(activeItem.labelKey) : t('common.appName')}
      </p>
      <div className="header-brand">
        <ItattiLogo className="header-brand-logo" />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={toggleLanguage}
              />
            }
          >
            <Languages />
            <span>{i18n.language.toUpperCase()}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('common.language')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="icon-action"
                size="icon"
                type="button"
                aria-label={theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')}
                onClick={toggleTheme}
              />
            }
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
