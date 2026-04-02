import { useAuth0 } from '@auth0/auth0-react';
import { auth0Config } from '@/config/auth0';

export function useUserRoles(): string[] {
  const { user, isAuthenticated } = useAuth0();

  if (!isAuthenticated || !user) return [];

  return (user[`${auth0Config.namespace}/roles`] as string[]) ?? [];
}

export function useCivicrmId(): string | undefined {
  const { user, isAuthenticated } = useAuth0();

  if (!isAuthenticated || !user) return undefined;

  const appMetadata = user[`${auth0Config.namespace}/app_metadata`] as Record<string, unknown> | undefined;
  return (appMetadata?.civicrm_id as string) ?? undefined;
}
