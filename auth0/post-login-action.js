/**
 * Auth0 Post-Login Action
 *
 * This action enriches tokens with:
 * - User roles on both ID and access tokens (from Auth0 RBAC, requires authorization)
 * - App metadata on both ID and access tokens (CiviCRM contact ID)
 * - User name and email on the access token only (for server-side audit trail)
 *
 * NOTE: This file is documentation only. The actual Action lives in the
 * Auth0 Dashboard (Actions > Flows > Login) and must be updated there.
 *
 * Deployment:
 * 1. Go to Auth0 Dashboard > Actions > Flows > Login
 * 2. Edit the existing Post-Login Action
 * 3. Paste this code
 * 4. Deploy
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://auth0.itatti.harvard.edu';

  // User-level claims (always available, no authorization required)
  api.idToken.setCustomClaim(`${namespace}/app_metadata`, event.user.app_metadata || {});
  api.accessToken.setCustomClaim(`${namespace}/app_metadata`, event.user.app_metadata || {});
  api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name || null);
  api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email || null);

  // Role claims (require authorization context)
  if (event.authorization) {
    api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
    api.accessToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);

    // TODO: remove by 2026-10 — legacy non-namespaced claims for backwards compatibility.
    // Once all consumers use namespaced claims (AUTH0_NAMESPACE/roles, AUTH0_NAMESPACE/app_metadata),
    // these can be deleted from both this file and the Auth0 Dashboard Action.
    api.idToken.setCustomClaim(`roles`, event.authorization.roles);
    api.accessToken.setCustomClaim(`roles`, event.authorization.roles);
    api.idToken.setCustomClaim(`app_metadata`, event.user.app_metadata);
  }
};
