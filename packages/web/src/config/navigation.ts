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
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

export interface NavSection {
  heading?: string;
  requiredRoles?: string[];
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { label: 'My Profile', path: '/profile', icon: User },
    ],
  },
  {
    heading: 'VIT ID Administration',
    requiredRoles: [KnownRoles.FELLOWS_ADMIN, KnownRoles.STAFF_IT],
    items: [
      { label: 'Has VIT ID?', path: '/admin/has-vitid', icon: Search },
      { label: 'Manage Appointees', path: '/admin/fellows', icon: Users },
      { label: 'Emails', path: '/admin/emails', icon: Mail },
      { label: 'Forms', path: '/admin/forms', icon: FileText, end: false },
    ],
  },
  {
    heading: 'Portal Settings',
    requiredRoles: [KnownRoles.STAFF_IT],
    items: [
      { label: 'Claim Log', path: '/admin/claims', icon: ShieldCheck },
      { label: 'Automations', path: '/admin/automations', icon: CalendarClock },
      { label: 'Applications Catalog', path: '/admin/apps', icon: Grid3X3 },
      { label: 'Access & Permissions', path: '/admin/permissions', icon: KeyRound },
    ],
  },
  {
    heading: 'Atlassian Cloud',
    requiredRoles: [KnownRoles.STAFF_IT],
    items: [
      { label: 'Manage Group Mapping', path: '/admin/atlassian/mappings', icon: LinkIcon },
      { label: 'Sync Users to Atlassian Cloud', path: '/admin/atlassian/sync', icon: RefreshCw },
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
