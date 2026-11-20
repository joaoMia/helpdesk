BEGIN;

ALTER TABLE "public"."ticket_attachments"
  DROP CONSTRAINT "attachment_shape",
  ADD CONSTRAINT "attachment_shape" CHECK (
    size > 0 AND size <= 20971520 AND
    mime IN (
      'image/png', 'text/plain', 'text/markdown', 'text/csv', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) AND sha256 ~ '^[a-f0-9]{64}$' AND storage_key ~ '^[a-f0-9-]{36}\.bin$'
    AND NOT (comment_id IS NOT NULL AND solution_id IS NOT NULL)
  );

ALTER TABLE "public"."opening_uploads"
  DROP CONSTRAINT "opening_upload_shape",
  ADD CONSTRAINT "opening_upload_shape" CHECK (
    size > 0 AND size <= 10485760 AND
    mime IN (
      'image/png', 'text/plain', 'text/markdown', 'text/csv', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) AND sha256 ~ '^[a-f0-9]{64}$' AND storage_key ~ '^[a-f0-9-]{36}\.bin$'
    AND expires_at > created_at
  );

ALTER TABLE "public"."project_attachments"
  DROP CONSTRAINT "project_attachments_mime_check",
  ADD CONSTRAINT "project_attachments_mime_check" CHECK (
    mime IN (
      'image/png', 'text/plain', 'text/markdown', 'text/csv', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
  );

ALTER TABLE "public"."project_conversation_attachments"
  DROP CONSTRAINT "project_conversation_attachments_mime_check",
  ADD CONSTRAINT "project_conversation_attachments_mime_check" CHECK (
    mime IN (
      'image/png', 'text/plain', 'text/markdown', 'text/csv', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
  );

COMMIT;
