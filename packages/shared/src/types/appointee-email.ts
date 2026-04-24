/**
 * Error-reason unions returned by the appointee-email admin endpoints
 * (send-bio-email, send-vit-id-email, email-preview). Shared between the
 * server (source of truth) and the web client (which renders reason-specific
 * copy) so adding a reason to one side surfaces as a TS error in the other.
 */

/** POST /api/admin/fellows/:contactId/send-bio-email — 400/502/503 body `{reason}` */
export type SendBioEmailReason =
  | 'no_vit_id'
  | 'no_matching_fellowship'
  | 'fellowship_not_accepted'
  | 'no_primary_email'
  | 'already_sent'
  | 'civicrm_unavailable'
  | 'email_send_failed';

/** POST /api/admin/fellows/:contactId/send-vit-id-email — 400/502/503 body `{reason}` */
export type SendVitIdEmailReason =
  | 'no_matching_fellowship'
  | 'fellowship_not_accepted'
  | 'no_primary_email'
  | 'missing_first_name'
  | 'already_has_vit_id'
  | 'needs_review'
  | 'already_sent'
  | 'civicrm_unavailable'
  | 'email_send_failed';

/**
 * GET /api/admin/fellows/:contactId/email-preview — 400/404/503 body `{reason}`.
 * Covers TemplateRenderError reasons plus the shared civicrm + no_primary_email
 * preconditions, plus 'contact_not_found' for 404.
 */
export type EmailPreviewReason =
  | 'missing_first_name'
  | 'no_primary_email'
  | 'contact_not_found'
  | 'civicrm_unavailable';
