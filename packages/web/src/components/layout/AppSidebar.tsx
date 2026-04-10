import { NavLink } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { hasAnyRole, KnownRoles } from '@itatti/shared';
import { useUIStore } from '@/stores/ui-store';
import {
  LayoutDashboard,
  User,
  Users,
  Search,
  Grid3X3,
  Link as LinkIcon,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import itattiLogo from '@/assets/itatti-logo.png';
import itattiMarchio from '@/assets/itatti-marchio.png';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface NavSection {
  heading?: string;
  requiredRoles?: string[];
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { label: 'My Profile', path: '/profile', icon: User },
    ],
  },
  {
    heading: 'VIT ID Administration',
    requiredRoles: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    items: [
      { label: 'Has VIT ID?', path: '/admin/has-vitid', icon: Search },
      { label: 'Manage Appointees', path: '/admin/fellows', icon: Users },
    ],
  },
  {
    heading: 'Portal Settings',
    requiredRoles: [KnownRoles.STAFF_IT],
    items: [
      { label: 'Applications Catalog', path: '/admin/apps', icon: Grid3X3 },
    ],
  },
  {
    heading: 'Atlassian Cloud',
    requiredRoles: [KnownRoles.STAFF_IT],
    items: [
      { label: 'Manage Group Mapping', path: '/admin/atlassian/mappings', icon: LinkIcon },
      { label: 'Sync Users to Atlassian Cloud', path: '/admin/atlassian/sync', icon: RefreshCw },
    ],
  },
];

interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const { user, logout } = useAuth0();
  const userRoles = useUserRoles();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const visibleSections = navSections.filter(
    (section) =>
      !section.requiredRoles || hasAnyRole(userRoles, section.requiredRoles)
  );

  return (
    <aside
      className={cn(
        'relative sticky top-0 flex h-screen flex-col overflow-visible border-r border-sidebar-border bg-sidebar transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo / Header */}
      <div className="border-b border-sidebar-border px-4 pb-5 pt-6">
        <div className="flex items-center">
          {!sidebarCollapsed ? (
            <img src={itattiLogo} alt="I Tatti" className="h-8 object-contain" />
          ) : (
            <img src={itattiMarchio} alt="I Tatti" className="h-8 object-contain mx-auto" />
          )}
          <button
            onClick={toggleSidebar}
            className={cn(
              'p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors',
              sidebarCollapsed ? 'mx-auto' : 'ml-auto'
            )}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
        {!sidebarCollapsed && (
          <h1 className="mt-3 text-[1.05rem] font-semibold tracking-[0.01em] text-primary">
            Profile Portal
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-3 overflow-visible py-5" role="navigation" aria-label="Main navigation">
        {visibleSections.map((section, i) => (
          <div key={i}>
            {section.heading && !sidebarCollapsed && (
              <div className="mb-1 px-4">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-muted-foreground">
                  {section.heading}
                </span>
              </div>
            )}
            {section.heading && sidebarCollapsed && (
              <div className="mx-3 mb-3 border-t border-sidebar-border" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  onClick={onNavigate}
                  {...(sidebarCollapsed ? { 'aria-label': item.label } : {})}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-2.5 rounded-lg text-[0.95rem] font-medium leading-5 transition-colors duration-150 ease-out',
                      isActive
                        ? 'mx-2 bg-primary px-3.5 py-2.5 text-white shadow-[0_6px_18px_rgba(171,25,45,0.16)]'
                        : 'mx-2 px-3.5 py-2 text-sidebar-foreground hover:bg-sidebar-accent',
                      sidebarCollapsed && isActive && 'justify-center px-2.5 py-2.5',
                      sidebarCollapsed && !isActive && 'justify-center px-2.5 py-2'
                    )
                  }
                >
                  <item.icon className="h-[18px] w-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User / Footer */}
      <div className="border-t border-sidebar-border p-4">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {user?.picture ? (
                <img src={user.picture} alt="" className="h-8 w-8 rounded-full" />
              ) : (
                <User className="h-4 w-4 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[0.95rem] font-medium">{user?.name || user?.email}</p>
            </div>
            <button
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-muted-foreground transition-colors flex-shrink-0"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-muted-foreground transition-colors mx-auto block"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
        {!sidebarCollapsed && (
          <p className="mt-3 text-xs tracking-[0.04em] text-sidebar-muted-foreground">v{__APP_VERSION__}</p>
        )}
      </div>
    </aside>
  );
}
