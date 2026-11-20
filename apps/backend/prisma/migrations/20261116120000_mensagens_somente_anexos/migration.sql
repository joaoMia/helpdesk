BEGIN;

ALTER TABLE "public"."ticket_comments"
  DROP CONSTRAINT "comment_content_valid",
  ADD CONSTRAINT "comment_content_valid"
    CHECK (content = '' OR length(btrim(content)) BETWEEN 1 AND 4000);

ALTER TABLE "public"."project_conversation_messages"
  DROP CONSTRAINT "project_conversation_messages_content_check",
  ADD CONSTRAINT "project_conversation_messages_content_check"
    CHECK (content = '' OR length(btrim(content)) BETWEEN 1 AND 4000);

CREATE FUNCTION "public"."require_ticket_comment_attachment"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "public"."ticket_attachments" f
    WHERE f.ticket_id = NEW.ticket_id AND f.comment_id = NEW.id
      AND f.uploader_id = NEW.author_id AND NOT f.is_draft
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An attachment is required for a comment without text';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ticket_comment_requires_attachment"
  AFTER INSERT ON "public"."ticket_comments" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.content = '')
  EXECUTE FUNCTION "public"."require_ticket_comment_attachment"();

CREATE FUNCTION "public"."keep_attachment_only_ticket_comment"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.comment_id, NEW.ticket_id, NEW.uploader_id) IS NOT DISTINCT FROM
       (OLD.comment_id, OLD.ticket_id, OLD.uploader_id) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "public"."ticket_comments" c
    WHERE c.ticket_id = OLD.ticket_id AND c.id = OLD.comment_id AND c.content = ''
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Attachment of a comment without text cannot be detached';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "keep_attachment_only_ticket_comment"
  BEFORE UPDATE OF comment_id, ticket_id, uploader_id OR DELETE ON "public"."ticket_attachments"
  FOR EACH ROW WHEN (OLD.comment_id IS NOT NULL)
  EXECUTE FUNCTION "public"."keep_attachment_only_ticket_comment"();

CREATE FUNCTION "public"."require_project_message_attachment"()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "public"."project_conversation_attachments" f
    WHERE f.project_id = NEW.project_id AND f.message_id = NEW.id
      AND f.owner_id = NEW.author_id AND f.claimed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An attachment is required for a message without text';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "project_message_requires_attachment"
  AFTER INSERT ON "public"."project_conversation_messages" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.content = '')
  EXECUTE FUNCTION "public"."require_project_message_attachment"();

COMMIT;
