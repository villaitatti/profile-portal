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

export interface NavItem {
  /** i18n key under the `nav.` namespace, resolved with t() at render time. */
  labelKey: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

export interface NavSection {
  /** i18n key under the `nav.` namespace, resolved with t() at render time. */
  headingKey?: string;
  requiredRoles?: string[];
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    items: [
      { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard },
      { labelKey: 'nav.myProfile', path: '/profile', icon: User },
    ],
  },
  {
    headingKey: 'nav.vitIdAdministration',
    requiredRoles: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    items: [
      { labelKey: 'nav.hasVitId', path: '/admin/has-vitid', icon: Search },
      { labelKey: 'nav.manageAppointees', path: '/admin/fellows', icon: Users },
      { labelKey: 'nav.emails', path: '/admin/emails', icon: Mail },
      { labelKey: 'nav.forms', path: '/admin/forms', icon: FileText, end: false },
    ],
  },
  {
    headingKey: 'nav.portalSettings',
    requiredRoles: [KnownRoles.STAFF_IT],
    items: [
      { labelKey: 'nav.claimLog', path: '/admin/claims', icon: ShieldCheck },
      { labelKey: 'nav.automations', path: '/admin/automations', icon: CalendarClock },
      { labelKey: 'nav.applicationsCatalog', path: '/admin/apps', icon: Grid3X3 },
      { labelKey: 'nav.accessPermissions', path: '/admin/permissions', icon: KeyRound },
    ],
  },
  {
    headingKey: 'nav.atlassianCloud',
    requiredRoles: [KnownRoles.STAFF_IT],
    items: [
      { labelKey: 'nav.manageGroupMapping', path: '/admin/atlassian/mappings', icon: LinkIcon },
      { labelKey: 'nav.syncUsersToAtlassian', path: '/admin/atlassian/sync', icon: RefreshCw },
    ],
  },
];

export const apiAccessRules = [
  {
    label: 'Authenticated portal',
    visibleTo: 'Any authenticated Auth0 user',
    access: [
      'GET /api/profile',
      'GET/POST/PUT/DELETE /api/profile/contact/*',
      'GET /api/applications',
    ],
  },
  {
    label: 'VIT ID Administration',
    visibleTo: 'fellows-admin or staff-IT',
    access: [
      '/api/admin/fellows/*',
      'POST /api/admin/vit-id-lookup',
      '/api/admin/emails/*',
      '/api/admin/forms/*',
    ],
  },
  {
    label: 'Portal Settings',
    visibleTo: 'staff-IT only',
    access: [
      '/api/admin/claims/*',
      '/api/admin/automations/*',
      'POST/PUT/DELETE /api/applications/*',
      '/api/admin/uploads/images/*',
      'GET /api/roles',
    ],
  },
  {
    label: 'Atlassian Cloud',
    visibleTo: 'staff-IT only',
    access: ['/api/admin/sync/*'],
  },
] as const;
