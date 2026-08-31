import { describe, expect, it } from 'vitest';
import type { ComponentType, ReactElement } from 'react';
import i18n from '../../i18n/config';
import {
  accessSections,
  getAccessSection,
  requiredRolesFor,
} from '../../config/access';
import { navSections } from '../../config/navigation';
import { router } from '../../config/routes';

/**
 * Consistency checks for the single source of truth in src/config/access.ts:
 * the router guards, the sidebar registry, and the Access & Permissions page
 * all derive from it, and these tests fail if any consumer drifts.
 */

// Minimal structural view of the router's route objects — enough to walk the
// tree and invoke guard `lazy()` loaders without reaching into router internals.
interface RouteNode {
  path?: string;
  children?: RouteNode[];
  lazy?: () => Promise<{ Component?: ComponentType }>;
}

function collectPaths(nodes: readonly RouteNode[] | undefined, acc: string[] = []): string[] {
  for (const node of nodes ?? []) {
    if (node.path) acc.push(node.path);
    collectPaths(node.children, acc);
  }
  return acc;
}

/** Guard nodes are the lazy, pathless groups whose direct children are /admin pages. */
function collectGuardNodes(nodes: readonly RouteNode[] | undefined, acc: RouteNode[] = []): RouteNode[] {
  for (const node of nodes ?? []) {
    if (node.lazy && node.children?.some((child) => child.path?.startsWith('/admin'))) {
      acc.push(node);
    }
    collectGuardNodes(node.children, acc);
  }
  return acc;
}

const routeTree = router.routes as RouteNode[];
const routerPaths = collectPaths(routeTree);

describe('access config — navigation agreement', () => {
  it('derives one sidebar section per access section, in order', () => {
    expect(navSections).toHaveLength(accessSections.length);
    accessSections.forEach((section, index) => {
      const nav = navSections[index];
      expect(nav.headingKey).toBe(section.navHeadingKey);
      expect(nav.requiredRoles ?? []).toEqual([...(section.requiredRoles ?? [])]);
      expect(nav.items.map((item) => item.path)).toEqual(
        section.navItems.map((item) => item.path)
      );
      expect(nav.items.map((item) => item.labelKey)).toEqual(
        section.navItems.map((item) => item.labelKey)
      );
    });
  });

  it('lists every nav destination among its section route paths', () => {
    for (const section of accessSections) {
      for (const item of section.navItems) {
        expect(section.routePaths, `${section.key} → ${item.path}`).toContain(item.path);
      }
    }
  });
});

describe('access config — router agreement', () => {
  it('registers every access-config route path in the router', () => {
    for (const section of accessSections) {
      for (const path of section.routePaths) {
        expect(routerPaths, `${section.key} → ${path}`).toContain(path);
      }
    }
  });

  it('maps every admin route in the router to exactly one role-guarded section', () => {
    const adminPaths = routerPaths.filter((path) => path.startsWith('/admin'));
    expect(adminPaths.length).toBeGreaterThan(0);
    for (const path of adminPaths) {
      const owners = accessSections.filter(
        (section) => section.requiredRoles && section.routePaths.includes(path)
      );
      expect(owners.map((s) => s.key), `owners of ${path}`).toHaveLength(1);
    }
  });

  it('guards every admin route group with the roles from the access config', async () => {
    const guardNodes = collectGuardNodes(routeTree);
    // One guard for VIT ID Administration, one shared by the two staff-only sections.
    expect(guardNodes).toHaveLength(2);

    for (const node of guardNodes) {
      const { Component } = await node.lazy!();
      expect(Component).toBeDefined();
      // The guard Component is a plain function returning <RoleGuard …/>;
      // calling it (no hooks run until render) exposes the roles it passes.
      const element = (Component as () => ReactElement<{ requiredRoles: string[] }>)();
      const guardRoles = [...element.props.requiredRoles].sort();

      const childPaths = collectPaths(node.children);
      const coveredSections = accessSections.filter(
        (section) =>
          section.requiredRoles && section.routePaths.every((path) => childPaths.includes(path))
      );
      expect(coveredSections.length).toBeGreaterThan(0);

      // Every route under the guard belongs to one of the covered sections…
      for (const path of childPaths) {
        expect(
          coveredSections.some((section) => section.routePaths.includes(path)),
          `unclaimed guarded route ${path}`
        ).toBe(true);
      }
      // …and every covered section demands exactly the roles the guard enforces.
      for (const section of coveredSections) {
        expect([...section.requiredRoles!].sort(), section.key).toEqual(guardRoles);
      }
    }
  });

  it('exposes guard roles through requiredRolesFor as fresh mutable arrays', () => {
    const first = requiredRolesFor('portalSettings');
    const second = requiredRolesFor('portalSettings');
    expect(first).toEqual([...(getAccessSection('portalSettings').requiredRoles ?? [])]);
    expect(first).not.toBe(second);
  });
});

describe('access config — i18n keys', () => {
  const languages = ['en', 'it'] as const;

  it('resolves every referenced i18n key in both languages', () => {
    for (const section of accessSections) {
      const keys = [
        section.labelKey,
        section.visibleToKey,
        ...(section.navHeadingKey ? [section.navHeadingKey] : []),
        ...section.navItems.map((item) => item.labelKey),
      ];
      for (const key of keys) {
        for (const lng of languages) {
          // getResource ignores fallback languages, so a key missing from the
          // Italian bundle fails instead of silently reading the English copy.
          const value: unknown = i18n.getResource(lng, 'translation', key);
          expect(typeof value, `${key} (${lng})`).toBe('string');
          expect(value, `${key} (${lng})`).not.toBe('');
        }
      }
    }
  });
});
