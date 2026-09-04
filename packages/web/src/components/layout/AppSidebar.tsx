import { NavLink, useLocation } from 'react-router';
import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import { IdCard, LogOut, User } from 'lucide-react';
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
    void logout({ logoutParams: { returnTo: window.location.origin } });

  return (
    <Sidebar
      collapsible="icon"
      // The ui/sidebar primitive stays i18n-free; translated copy is injected here.
      sheetTitle={t('common.sidebar')}
      sheetDescription={t('common.mobileSidebarDescription')}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Product identity: crimson tile + Bodoni product name + a one-line
                descriptor. The institution's wordmark sits in the header, so the
                sidebar names the product, not the institute (same split as Libra). */}
            <SidebarMenuButton
              size="lg"
              tooltip={t('common.appName')}
              render={<NavLink to="/dashboard" viewTransition onClick={handleNavigate} />}
            >
              <span className="brand-mark flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg shadow-sm">
                <IdCard className="size-4.5" aria-hidden />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-heading text-[1.3rem]">{t('common.appName')}</span>
                {/* Brandon, not Bodoni: at this size the didone sits under its hairline floor. */}
                <span className="truncate text-[0.72rem] text-sidebar-foreground/70">
                  {t('common.productEyebrow')}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                        // The active item's icon takes the crimson mark: one
                        // quiet brand touch per screen.
                        className="data-[active=true]:[&>svg]:text-crimson-mark"
                        render={
                          <NavLink
                            to={item.path}
                            end={item.end ?? true}
                            viewTransition
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
      <SidebarRail aria-label={t('common.toggleSidebar')} title={t('common.toggleSidebar')} />
    </Sidebar>
  );
}
