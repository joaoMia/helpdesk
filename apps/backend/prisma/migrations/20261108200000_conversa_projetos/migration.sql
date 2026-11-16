CREATE TABLE "public".project_conversation_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES "public".project_requests(id) ON DELETE RESTRICT,
 author_id uuid NOT NULL REFERENCES "public".users(id) ON DELETE RESTRICT,
 client_message_id uuid NOT NULL,
 content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 4000),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT project_conversation_message_idempotency UNIQUE(project_id,author_id,client_message_id)
);
CREATE INDEX project_conversation_messages_page_idx ON "public".project_conversation_messages(project_id,created_at,id);

CREATE TABLE "public".project_conversation_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES "public".project_requests(id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES "public".users(id) ON DELETE RESTRICT,
 message_id uuid REFERENCES "public".project_conversation_messages(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 240),
 mime text NOT NULL CHECK(mime IN ('image/png','text/plain')),
 size integer NOT NULL CHECK(size BETWEEN 1 AND 10485760),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^[a-f0-9-]{36}\.bin$'),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at timestamptz(3) NOT NULL,
 claimed_at timestamptz(3),
 CHECK((message_id IS NULL)=(claimed_at IS NULL))
);
CREATE INDEX project_conversation_attachments_project_idx ON "public".project_conversation_attachments(project_id,created_at,id);
CREATE INDEX project_conversation_attachments_owner_expiry_idx ON "public".project_conversation_attachments(owner_id,expires_at);

CREATE TABLE "public".project_conversation_attachment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 file_id uuid NOT NULL,
 project_id uuid NOT NULL REFERENCES "public".project_requests(id) ON DELETE RESTRICT,
 actor_id uuid REFERENCES "public".users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('UPLOADED','DISCARDED','CLAIMED','DOWNLOADED','EXPIRED')),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX project_conversation_attachment_events_file_idx ON "public".project_conversation_attachment_events(file_id,created_at,id);
CREATE TRIGGER project_conversation_attachment_events_immutable BEFORE UPDATE OR DELETE ON "public".project_conversation_attachment_events FOR EACH ROW EXECUTE FUNCTION "public".immutable_conversation_record();

CREATE FUNCTION "public".guard_project_conversation_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Project conversation messages are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER project_conversation_message_immutable BEFORE UPDATE OR DELETE ON "public".project_conversation_messages FOR EACH ROW EXECUTE FUNCTION "public".guard_project_conversation_message();

CREATE FUNCTION "public".guard_project_conversation_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.message_id IS NOT NULL THEN RAISE EXCEPTION 'Claimed conversation attachment is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.message_id IS NULL OR NEW.claimed_at IS NULL OR (to_jsonb(OLD)-'message_id'-'claimed_at')<>(to_jsonb(NEW)-'message_id'-'claimed_at')) THEN RAISE EXCEPTION 'Invalid project conversation attachment claim' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_conversation_attachment_guard BEFORE UPDATE OR DELETE ON "public".project_conversation_attachments FOR EACH ROW EXECUTE FUNCTION "public".guard_project_conversation_attachment();
