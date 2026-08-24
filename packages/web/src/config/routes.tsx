import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/components/layout/RootLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { KnownRoles } from '@itatti/shared';

function RouteErrorPage() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="mb-2 text-2xl font-bold">Page temporarily unavailable</h1>
      <p className="text-muted-foreground">
        This page could not be loaded. Reload to fetch the latest application files.
      </p>
      <button
        type="button"
        className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={() => window.location.reload()}
      >
        Reload page
      </button>
    </div>
  );
}

const fellowsAdminGuard = async () => {
  const { RoleGuard } = await import('@/components/auth/RoleGuard');
  return {
    Component: () => (
      <RoleGuard requiredRoles={[KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT]} />
    ),
  };
};

const staffGuard = async () => {
  const { RoleGuard } = await import('@/components/auth/RoleGuard');
  return { Component: () => <RoleGuard requiredRoles={[KnownRoles.STAFF_IT]} /> };
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
