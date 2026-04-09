/**
 * Auth0 Post-Login Action
 *
 * This action enriches the ID token and access token with:
 * - User roles (from Auth0 RBAC)
 * - App metadata (CiviCRM contact ID, set during VIT ID claim)
 * - User name and email (for audit trail in admin features)
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

  if (event.authorization) {
    // Namespaced claims
    api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
    api.accessToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
    api.idToken.setCustomClaim(`${namespace}/app_metadata`, event.user.app_metadata);
    api.accessToken.setCustomClaim(`${namespace}/app_metadata`, event.user.app_metadata);
    api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name);
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);

    // Temporary: keep the old claim for backwards compatibility
    api.idToken.setCustomClaim(`roles`, event.authorization.roles);
    api.accessToken.setCustomClaim(`roles`, event.authorization.roles);
    api.idToken.setCustomClaim(`app_metadata`, event.user.app_metadata);
  }
};
