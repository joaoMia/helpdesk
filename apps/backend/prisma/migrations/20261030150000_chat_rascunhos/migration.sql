-- Existing attachments retain their original visibility and relationships.
ALTER TABLE "public"."ticket_attachments" ADD COLUMN "is_draft" BOOLEAN NOT NULL DEFAULT false;
-- statement-breakpoint
ALTER TABLE "public"."ticket_attachments" ADD CONSTRAINT "draft_attachment_unlinked" CHECK (NOT "is_draft" OR ("comment_id" IS NULL AND "solution_id" IS NULL));
