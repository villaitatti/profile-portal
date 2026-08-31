// Sidebar navigation registry, derived from the access config
// (src/config/access.ts) so the menu, the route guards, and the
// Access & Permissions page can never disagree about roles or placement.
import { accessSections, type AccessNavItem } from './access';

export type NavItem = AccessNavItem;

export interface NavSection {
  /** i18n key under the `nav.` namespace, resolved with t() at render time. */
  headingKey?: string;
  requiredRoles?: string[];
  items: readonly NavItem[];
}

export const navSections: NavSection[] = accessSections.map((section) => ({
  headingKey: section.navHeadingKey,
  requiredRoles: section.requiredRoles ? [...section.requiredRoles] : undefined,
  items: section.navItems,
}));
