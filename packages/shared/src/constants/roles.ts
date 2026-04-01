import { KnownRoles } from '../types/auth.js';

export const ADMIN_ROLES = [KnownRoles.STAFF_IT] as const;

export const FELLOWS_ADMIN_ROLES = [
  KnownRoles.FELLOWS_ADMIN,
  KnownRoles.STAFF_IT,
] as const;

export function hasAnyRole(userRoles: string[], requiredRoles: string[]): boolean {
  return requiredRoles.some((role) => userRoles.includes(role));
}

export function isAdmin(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, [...ADMIN_ROLES]);
}
