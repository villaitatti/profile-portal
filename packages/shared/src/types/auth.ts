export const AUTH0_NAMESPACE = 'https://auth0.itatti.harvard.edu';

export const KnownRoles = {
  FELLOWS: 'fellows',
  FELLOWS_CURRENT: 'fellows-current',
  FELLOWS_ADMIN: 'fellows-admin',
  STAFF_IT: 'staff-it',
} as const;

export type KnownRole = (typeof KnownRoles)[keyof typeof KnownRoles];

export type TokenClaims = {
  [K in `${typeof AUTH0_NAMESPACE}/roles`]: string[];
} & {
  [K in `${typeof AUTH0_NAMESPACE}/civicrm_id`]?: string;
};

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source: 'civicrm' | 'auth0';
}
