UPDATE "form_invitations"
SET "form_type" = 'fellow-memorandum-v3'
WHERE "form_type" = 'fellow-memorandum-v2'
  AND "status" = 'pending';
