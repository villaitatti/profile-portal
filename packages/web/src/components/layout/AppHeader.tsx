import { Languages, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTheme } from '@/lib/theme';
import { persistLanguage } from '@/i18n/config';

export function AppHeader() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const toggleLanguage = () => {
    const next = i18n.language === 'it' ? 'en' : 'it';
    void i18n.changeLanguage(next);
    persistLanguage(next);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
      <Tooltip>
        <TooltipTrigger render={<SidebarTrigger aria-label={t('common.toggleSidebar')} />} />
        <TooltipContent side="bottom">
          {t('common.toggleSidebar')}{' '}
          <kbd className="rounded border border-background/30 px-1 font-sans text-[0.65rem]">
            ⌘B
          </kbd>
        </TooltipContent>
      </Tooltip>
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
