import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Submissions', path: '/admin/forms', end: true },
  { label: 'Templates', path: '/admin/forms/templates', end: true },
];

export function FormsSectionNav() {
  return (
    <nav className="border-b border-border" aria-label="Forms views">
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'relative px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                isActive &&
                  'text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
