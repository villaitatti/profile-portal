import { createBrowserRouter, Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { RootLayout } from '@/components/layout/RootLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { requiredRolesFor } from '@/config/access';

// Safe to translate: this boundary can only render under <RouterProvider>,
// which App mounts after its import of @/i18n/config has synchronously
// initialized i18next from bundled resources. Failures earlier than that
// (e.g. a stale App chunk) never reach the router — main.tsx renders its
// plain-DOM, deliberately hardcoded boot-failure fallback instead.
function RouteErrorPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="mb-2 font-heading text-[1.8rem] leading-tight">{t('common.routeError.title')}</h1>
      <p className="text-muted-foreground">{t('common.routeError.description')}</p>
      <Button type="button" size="lg" className="mt-6" onClick={() => window.location.reload()}>
        {t('common.routeError.reload')}
      </Button>
    </div>
  );
}

// Guard roles come from the access config (src/config/access.ts), the single
// source of truth shared with the sidebar and the Access & Permissions page.
const fellowsAdminGuard = async () => {
  const { RoleGuard } = await import('@/components/auth/RoleGuard');
  return {
    Component: () => (
      <RoleGuard requiredRoles={requiredRolesFor('vitIdAdministration')} />
    ),
  };
};

// Portal Settings and Atlassian Cloud share the same staff-only audience, so
// one guard covers both sections' routes (the access test keeps them aligned).
const staffGuard = async () => {
  const { RoleGuard } = await import('@/components/auth/RoleGuard');
  return {
    Component: () => <RoleGuard requiredRoles={requiredRolesFor('portalSettings')} />,
  };
};

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    HydrateFallback: LoadingSpinner,
    ErrorBoundary: RouteErrorPage,
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            path: '/claim',
            lazy: async () => ({
              Component: (await import('@/pages/claim/ClaimPage')).ClaimPage,
            }),
          },
          {
            path: '/forms/:token',
            lazy: async () => ({
              Component: (await import('@/pages/forms/PublicFormPage')).PublicFormPage,
            }),
          },
          // Catch-all: a URL that matches no route gets a translated
          // not-found page (inside the public layout so the header, theme and
          // language toggles stay available), not the chunk-load error
          // boundary whose "reload" advice can never fix a typo'd address.
          {
            path: '*',
            lazy: async () => ({
              Component: (await import('@/pages/NotFoundPage')).NotFoundPage,
            }),
          },
        ],
      },
      // Auth is loaded only for the callback and protected routes. Public form
      // recipients do not download the Auth0 SDK.
      {
        lazy: async () => ({
          Component: (await import('@/components/auth/AuthProviderBoundary'))
            .AuthProviderBoundary,
        }),
        children: [
          {
            path: '/callback',
            lazy: async () => ({
              Component: (await import('@/components/auth/CallbackPage')).CallbackPage,
            }),
          },
          {
            lazy: async () => ({
              Component: (await import('@/components/auth/AuthenticationGuard'))
                .AuthenticationGuard,
            }),
            children: [
              {
                lazy: async () => ({
                  Component: (await import('@/components/layout/AuthenticatedLayout'))
                    .AuthenticatedLayout,
                }),
                children: [
                  {
                    path: '/dashboard',
                    lazy: async () => ({
                      Component: (await import('@/pages/dashboard/DashboardPage')).DashboardPage,
                    }),
                  },
                  {
                    path: '/profile',
                    lazy: async () => ({
                      Component: (await import('@/pages/profile/ProfilePage')).ProfilePage,
                    }),
                  },
                  {
                    lazy: fellowsAdminGuard,
                    children: [
                      {
                        path: '/admin/fellows',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/FellowsManagementPage'))
                            .FellowsManagementPage,
                        }),
                      },
                      {
                        path: '/admin/has-vitid',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/HasVitIdPage')).HasVitIdPage,
                        }),
                      },
                      {
                        path: '/admin/emails',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/EmailsPage')).EmailsPage,
                        }),
                      },
                      {
                        path: '/admin/forms',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/FormsSubmissionsPage'))
                            .FormsSubmissionsPage,
                        }),
                      },
                      {
                        path: '/admin/forms/templates',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/FormsTemplatesPage'))
                            .FormsTemplatesPage,
                        }),
                      },
                    ],
                  },
                  {
                    lazy: staffGuard,
                    children: [
                      {
                        path: '/admin/claims',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/ClaimLogPage')).ClaimLogPage,
                        }),
                      },
                      {
                        path: '/admin/automations',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/AutomationsPage')).AutomationsPage,
                        }),
                      },
                      {
                        path: '/admin/apps',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/AppCatalogPage')).AppCatalogPage,
                        }),
                      },
                      {
                        path: '/admin/apps/new',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/AppFormPage')).AppFormPage,
                        }),
                      },
                      {
                        path: '/admin/apps/:id/edit',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/AppFormPage')).AppFormPage,
                        }),
                      },
                      {
                        path: '/admin/permissions',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/AccessPermissionsPage'))
                            .AccessPermissionsPage,
                        }),
                      },
                      {
                        path: '/admin/atlassian/mappings',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/AtlassianMappingsPage'))
                            .AtlassianMappingsPage,
                        }),
                      },
                      {
                        path: '/admin/atlassian/sync',
                        lazy: async () => ({
                          Component: (await import('@/pages/admin/AtlassianSyncPage'))
                            .AtlassianSyncPage,
                        }),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '/', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
