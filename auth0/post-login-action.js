/**
 * Auth0 Post-Login Action
 *
 * This action enriches the ID token and access token with:
 * - User roles (from Auth0 RBAC)
 * - CiviCRM contact ID (from app_metadata, set during VIT ID claim)
 *
 * Deployment:
 * 1. Go to Auth0 Dashboard > Actions > Flows > Login
 * 2. Create a new Custom Action
 * 3. Paste this code
 * 4. Deploy and add to the Login flow
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://itatti.harvard.edu';

  // Add user roles to tokens
  if (event.authorization) {
    api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
    api.accessToken.setCustomClaim(
      `${namespace}/roles`,
      event.authorization.roles
    );
  }

  // Add CiviCRM contact ID to tokens (if present)
  const civicrmId = event.user.app_metadata?.civicrm_id;
  if (civicrmId) {
    api.idToken.setCustomClaim(`${namespace}/civicrm_id`, civicrmId);
    api.accessToken.setCustomClaim(`${namespace}/civicrm_id`, civicrmId);
  }
};
