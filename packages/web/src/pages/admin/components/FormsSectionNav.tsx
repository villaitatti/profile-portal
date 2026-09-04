import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const tabs = [
  { labelKey: 'admin.formsNav.submissions', path: '/admin/forms', end: true },
  { labelKey: 'admin.formsNav.templates', path: '/admin/forms/templates', end: true },
];

export function FormsSectionNav() {
  const { t } = useTranslation();

  return (
    <nav className="border-b border-border" aria-label={t('admin.formsNav.ariaLabel')}>
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.end}
            viewTransition
            className={({ isActive }) =>
              cn(
                'relative px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                isActive &&
                  'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-crimson-mark'
              )
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
