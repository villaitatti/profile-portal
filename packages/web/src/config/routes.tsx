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

// Pages
import { ClaimPage } from '@/pages/claim/ClaimPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { AppCatalogPage } from '@/pages/admin/AppCatalogPage';
import { AppFormPage } from '@/pages/admin/AppFormPage';
import { FellowsManagementPage } from '@/pages/admin/FellowsManagementPage';
import { HasVitIdPage } from '@/pages/admin/HasVitIdPage';
import { AtlassianMappingsPage } from '@/pages/admin/AtlassianMappingsPage';
import { AtlassianSyncPage } from '@/pages/admin/AtlassianSyncPage';
import { ClaimLogPage } from '@/pages/admin/ClaimLogPage';
import { AutomationsPage } from '@/pages/admin/AutomationsPage';
import { EmailsPage } from '@/pages/admin/EmailsPage';

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

      // Auth0 callback — wait for token exchange before redirecting
      { path: '/callback', element: <CallbackPage /> },

      // Protected routes
      {
        element: <AuthenticationGuard />,
        children: [
          {
            element: <AuthenticatedLayout />,
            children: [
              { path: '/dashboard', element: <DashboardPage /> },
              { path: '/profile', element: <ProfilePage /> },

              // VIT ID Administration (fellows-admin OR staff-it)
              {
                element: (
                  <RoleGuard
                    requiredRoles={[KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT]}
                  />
                ),
                children: [
                  { path: '/admin/fellows', element: <FellowsManagementPage /> },
                  { path: '/admin/has-vitid', element: <HasVitIdPage /> },
                  { path: '/admin/emails', element: <EmailsPage /> },
                ],
              },

              // Portal Settings + Atlassian Cloud + Claim Log + Automations (staff-it only)
              {
                element: <RoleGuard requiredRoles={[KnownRoles.STAFF_IT]} />,
                children: [
                  { path: '/admin/claims', element: <ClaimLogPage /> },
                  { path: '/admin/automations', element: <AutomationsPage /> },
                  { path: '/admin/apps', element: <AppCatalogPage /> },
                  { path: '/admin/apps/new', element: <AppFormPage /> },
                  { path: '/admin/apps/:id/edit', element: <AppFormPage /> },
                  { path: '/admin/atlassian/mappings', element: <AtlassianMappingsPage /> },
                  { path: '/admin/atlassian/sync', element: <AtlassianSyncPage /> },
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
