import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/components/layout/RootLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';
import { AuthenticationGuard } from '@/components/auth/AuthenticationGuard';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { KnownRoles } from '@itatti/shared';

// Pages
import { ClaimPage } from '@/pages/claim/ClaimPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { AdminPage } from '@/pages/admin/AdminPage';
import { AppCatalogPage } from '@/pages/admin/AppCatalogPage';
import { AppFormPage } from '@/pages/admin/AppFormPage';
import { FellowsManagementPage } from '@/pages/admin/FellowsManagementPage';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // Public routes
      {
        element: <PublicLayout />,
        children: [
          { path: '/claim', element: <ClaimPage /> },
        ],
      },

      // Auth0 callback (handled by Auth0Provider)
      { path: '/callback', element: <Navigate to="/dashboard" replace /> },

      // Protected routes
      {
        element: <AuthenticationGuard />,
        children: [
          {
            element: <AuthenticatedLayout />,
            children: [
              { path: '/dashboard', element: <DashboardPage /> },
              { path: '/profile', element: <ProfilePage /> },

              // Admin routes: Fellows management (fellows-admin OR staff-it)
              {
                element: (
                  <RoleGuard
                    requiredRoles={[KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT]}
                  />
                ),
                children: [
                  { path: '/admin', element: <AdminPage /> },
                  { path: '/admin/fellows', element: <FellowsManagementPage /> },
                ],
              },

              // Admin routes: IT admin (staff-it only)
              {
                element: <RoleGuard requiredRoles={[KnownRoles.STAFF_IT]} />,
                children: [
                  { path: '/admin/apps', element: <AppCatalogPage /> },
                  { path: '/admin/apps/new', element: <AppFormPage /> },
                  { path: '/admin/apps/:id/edit', element: <AppFormPage /> },
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
