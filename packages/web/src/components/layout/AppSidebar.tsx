import { NavLink, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import { LogOut, User } from 'lucide-react';
import { useProfile } from '@/api/profile';
import { useUserRoles } from '@/hooks/useUserRoles';
import { hasAnyRole } from '@itatti/shared';
import { navSections, type NavItem } from '@/config/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import itattiLogo from '@/assets/itatti-logo.png';
import itattiMarchio from '@/assets/itatti-marchio.png';

interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth0();
  const { data: profile } = useProfile();
  const userRoles = useUserRoles();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const avatarUrl = profile?.imageUrl || user?.picture;

  const visibleSections = navSections.filter(
    (section) =>
      !section.requiredRoles || hasAnyRole(userRoles, section.requiredRoles)
  );

  // Selecting a destination should also dismiss the mobile drawer.
  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false);
    onNavigate?.();
  };

  // Mirrors NavLink's `end` semantics (default true) for the button highlight.
  const isItemActive = (item: NavItem) =>
    (item.end ?? true) ? pathname === item.path : pathname.startsWith(item.path);

  const handleLogout = () =>
    logout({ logoutParams: { returnTo: window.location.origin } });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center px-2 pt-2">
          <img
            src={itattiLogo}
            alt="I Tatti"
            className="h-8 object-contain group-data-[collapsible=icon]:hidden"
          />
          <img
            src={itattiMarchio}
            alt="I Tatti"
            className="mx-auto hidden h-8 object-contain group-data-[collapsible=icon]:block"
          />
        </div>
        <h1 className="px-2 text-[1.05rem] font-semibold tracking-[0.01em] text-primary group-data-[collapsible=icon]:hidden">
          {t('common.appName')}
        </h1>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t('nav.mainNavigation')} className="contents">
          {visibleSections.map((section, i) => (
            <SidebarGroup key={section.headingKey ?? i}>
              {section.headingKey && (
                <SidebarGroupLabel>{t(section.headingKey)}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isItemActive(item)}
                        tooltip={t(item.labelKey)}
                        render={
                          <NavLink
                            to={item.path}
                            end={item.end ?? true}
                            onClick={handleNavigate}
                          />
                        }
                      >
                        <item.icon aria-hidden />
                        <span>{t(item.labelKey)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 group-data-[collapsible=icon]:hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <User className="h-4 w-4 text-primary" />
            )}
          </div>
          <p className="min-w-0 flex-1 truncate text-[0.95rem] font-medium group-data-[collapsible=icon]:hidden">
            {user?.name || user?.email}
          </p>
          <button
            onClick={handleLogout}
            className="flex-shrink-0 rounded-md p-1.5 text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent"
            aria-label={t('common.signOut')}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <p className="px-1 pb-1 text-xs tracking-[0.04em] text-sidebar-muted-foreground group-data-[collapsible=icon]:hidden">
          v{__APP_VERSION__}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
