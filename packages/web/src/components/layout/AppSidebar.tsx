import { NavLink } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { hasAnyRole, KnownRoles } from '@itatti/shared';
import { useUIStore } from '@/stores/ui-store';
import {
  LayoutDashboard,
  User,
  Users,
  Settings,
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
    heading: 'VIT ID Admin',
    requiredRoles: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    items: [
      { label: 'Fellows', path: '/admin/fellows', icon: Users },
    ],
  },
  {
    heading: 'IT Admin',
    requiredRoles: [KnownRoles.STAFF_IT],
    items: [
      { label: 'Profile Portal Settings', path: '/admin', icon: Settings },
    ],
  },
];

export function AppSidebar() {
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
        'relative flex flex-col bg-sidebar transition-all duration-300 h-screen sticky top-0 overflow-visible shadow-[1px_0_3px_rgba(0,0,0,0.06)]',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo / Header */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
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
          <h1 className="text-lg font-bold text-primary tracking-tight mt-3">
            Profile Portal
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 pr-0 space-y-6 overflow-visible">
        {visibleSections.map((section, i) => (
          <div key={i}>
            {section.heading && !sidebarCollapsed && (
              <div className="px-3 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
                  {section.heading}
                </span>
              </div>
            )}
            {section.heading && sidebarCollapsed && (
              <div className="border-t border-sidebar-border mx-2 mb-2" />
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 text-[17px] font-medium transition-all duration-200 ease-out',
                      isActive
                        ? 'bg-[#ab192d] text-white border-l-[4px] border-white mr-[-8px] py-3 pl-3 pr-5 shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
                        : 'text-sidebar-foreground ml-2 mr-2 py-2.5 px-3 hover:bg-[#d0d7db] hover:translate-x-0.5 hover:shadow-sm',
                      sidebarCollapsed && isActive && 'justify-center px-2 pr-2 mr-[-6px]',
                      sidebarCollapsed && !isActive && 'justify-center px-2 ml-0 mr-2'
                    )
                  }
                >
                  <item.icon className="h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
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
              <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
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
          <p className="text-[10px] text-sidebar-muted-foreground mt-3">Profile Portal v{__APP_VERSION__}</p>
        )}
      </div>
    </aside>
  );
}
