import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { RootLayout } from '@/components/layout/RootLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';
import { AuthenticationGuard } from '@/components/auth/AuthenticationGuard';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { KnownRoles } from '@itatti/shared';

function CallbackPage() {
  const { isLoading } = useAuth0();
  if (isLoading) return <LoadingSpinner />;
  return <Navigate to="/dashboard" replace />;
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    HydrateFallback: LoadingSpinner,
    children: [
      // Public routes
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

      // Auth0 callback — wait for token exchange before redirecting
      { path: '/callback', element: <CallbackPage /> },

      // Protected routes
      {
        element: <AuthenticationGuard />,
        children: [
          {
            element: <AuthenticatedLayout />,
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

              // VIT ID Administration (fellows-admin OR staff-it)
              {
                element: (
                  <RoleGuard
                    requiredRoles={[KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT]}
                  />
                ),
                children: [
                  {
                    path: '/admin/fellows',
                    lazy: async () => ({
                      Component: (await import('@/pages/admin/FellowsManagementPage')).FellowsManagementPage,
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
                      Component: (await import('@/pages/admin/FormsSubmissionsPage')).FormsSubmissionsPage,
                    }),
                  },
                  {
                    path: '/admin/forms/templates',
                    lazy: async () => ({
                      Component: (await import('@/pages/admin/FormsTemplatesPage')).FormsTemplatesPage,
                    }),
                  },
                ],
              },

              // Portal Settings + Atlassian Cloud + Claim Log + Automations (staff-it only)
              {
                element: <RoleGuard requiredRoles={[KnownRoles.STAFF_IT]} />,
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
                      Component: (await import('@/pages/admin/AccessPermissionsPage')).AccessPermissionsPage,
                    }),
                  },
                  {
                    path: '/admin/atlassian/mappings',
                    lazy: async () => ({
                      Component: (await import('@/pages/admin/AtlassianMappingsPage')).AtlassianMappingsPage,
                    }),
                  },
                  {
                    path: '/admin/atlassian/sync',
                    lazy: async () => ({
                      Component: (await import('@/pages/admin/AtlassianSyncPage')).AtlassianSyncPage,
                    }),
                  },
                ],
              },
            ],
          },
        ],
      },

      // Root redirect
      { path: '/', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
