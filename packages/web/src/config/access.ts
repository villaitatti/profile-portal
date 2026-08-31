// Single source of truth for the role → portal-section mapping.
//
// Every consumer of "who can see what" derives from these sections:
//   - src/config/routes.tsx builds its route guards from `requiredRolesFor()`,
//   - src/config/navigation.ts derives the sidebar sections,
//   - src/pages/admin/AccessPermissionsPage.tsx renders the read-only
//     menu-visibility and API-access reference.
//
// i18n lookups are keyed by each section's stable `key` and the explicit
// `labelKey`/`visibleToKey` fields — never by English display copy.
// src/__tests__/config/access.test.ts asserts the consumers stay in agreement
// and that every key resolves in both languages.
import { KnownRoles } from '@itatti/shared';
import {
  CalendarClock,
  FileText,
  Grid3X3,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type AccessSectionKey =
  | 'authenticatedPortal'
  | 'vitIdAdministration'
  | 'portalSettings'
  | 'atlassianCloud';

export interface AccessNavItem {
  /** i18n key under the `nav.` namespace, resolved with t() at render time. */
  labelKey: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  /** Mirrors NavLink's `end` semantics; defaults to true. */
  end?: boolean;
}

export interface AccessSection {
  /** Stable identifier; guards, i18n and tests reference this, never English copy. */
  key: AccessSectionKey;
  /** i18n key for the section title (used by the API-access cards). */
  labelKey: string;
  /** i18n key describing the audience ("staff-IT only", …). */
  visibleToKey: string;
  /** Roles that unlock the section; undefined = any authenticated user. */
  requiredRoles?: readonly string[];
  /** Sidebar group heading i18n key; undefined = the ungrouped base items. */
  navHeadingKey?: string;
  /** Sidebar entries belonging to the section. */
  navItems: readonly AccessNavItem[];
  /** Every route path in the section, including subroutes not shown in the nav. */
  routePaths: readonly string[];
  /** Backend route groups enforcing the same boundary (technical, untranslated). */
  apiAccess: readonly string[];
}

export const accessSections: readonly AccessSection[] = [
  {
    key: 'authenticatedPortal',
    labelKey: 'admin.permissions.apiRuleAuthenticatedPortal',
    visibleToKey: 'admin.permissions.visibleToAnyUser',
    navItems: [
      { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard },
      { labelKey: 'nav.myProfile', path: '/profile', icon: User },
    ],
    routePaths: ['/dashboard', '/profile'],
    apiAccess: [
      'GET /api/profile',
      'GET/POST/PUT/DELETE /api/profile/contact/*',
      'GET /api/applications',
    ],
  },
  {
    key: 'vitIdAdministration',
    labelKey: 'nav.vitIdAdministration',
    visibleToKey: 'admin.permissions.visibleToFellowsAdminOrStaffIT',
    requiredRoles: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    navHeadingKey: 'nav.vitIdAdministration',
    navItems: [
      { labelKey: 'nav.hasVitId', path: '/admin/has-vitid', icon: Search },
      { labelKey: 'nav.manageAppointees', path: '/admin/fellows', icon: Users },
      { labelKey: 'nav.emails', path: '/admin/emails', icon: Mail },
      { labelKey: 'nav.forms', path: '/admin/forms', icon: FileText, end: false },
    ],
    routePaths: [
      '/admin/fellows',
      '/admin/has-vitid',
      '/admin/emails',
      '/admin/forms',
      '/admin/forms/templates',
    ],
    apiAccess: [
      '/api/admin/fellows/*',
      'POST /api/admin/vit-id-lookup',
      '/api/admin/emails/*',
      '/api/admin/forms/*',
    ],
  },
  {
    key: 'portalSettings',
    labelKey: 'nav.portalSettings',
    visibleToKey: 'admin.permissions.visibleToStaffITOnly',
    requiredRoles: [KnownRoles.STAFF_IT],
    navHeadingKey: 'nav.portalSettings',
    navItems: [
      { labelKey: 'nav.claimLog', path: '/admin/claims', icon: ShieldCheck },
      { labelKey: 'nav.automations', path: '/admin/automations', icon: CalendarClock },
      { labelKey: 'nav.applicationsCatalog', path: '/admin/apps', icon: Grid3X3 },
      { labelKey: 'nav.accessPermissions', path: '/admin/permissions', icon: KeyRound },
    ],
    routePaths: [
      '/admin/claims',
      '/admin/automations',
      '/admin/apps',
      '/admin/apps/new',
      '/admin/apps/:id/edit',
      '/admin/permissions',
    ],
    apiAccess: [
      '/api/admin/claims/*',
      '/api/admin/automations/*',
      'POST/PUT/DELETE /api/applications/*',
      '/api/admin/uploads/images/*',
      'GET /api/roles',
    ],
  },
  {
    key: 'atlassianCloud',
    labelKey: 'nav.atlassianCloud',
    visibleToKey: 'admin.permissions.visibleToStaffITOnly',
    requiredRoles: [KnownRoles.STAFF_IT],
    navHeadingKey: 'nav.atlassianCloud',
    navItems: [
      { labelKey: 'nav.manageGroupMapping', path: '/admin/atlassian/mappings', icon: LinkIcon },
      { labelKey: 'nav.syncUsersToAtlassian', path: '/admin/atlassian/sync', icon: RefreshCw },
    ],
    routePaths: ['/admin/atlassian/mappings', '/admin/atlassian/sync'],
    apiAccess: ['/api/admin/sync/*'],
  },
];

export function getAccessSection(key: AccessSectionKey): AccessSection {
  const section = accessSections.find((s) => s.key === key);
  if (!section) throw new Error(`Unknown access section: ${key}`);
  return section;
}

/** Roles guarding a section's routes, as the mutable array RoleGuard expects. */
export function requiredRolesFor(key: AccessSectionKey): string[] {
  return [...(getAccessSection(key).requiredRoles ?? [])];
}
