CREATE TABLE "public"."project_attachments" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 category_id uuid NOT NULL REFERENCES "public"."project_categories"(id) ON DELETE RESTRICT,
 version_id uuid NOT NULL,
 field_id uuid NOT NULL, field_key text NOT NULL,
 project_id uuid REFERENCES "public"."project_requests"(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 240),
 mime text NOT NULL CHECK(mime IN ('image/png','text/plain')),
 size integer NOT NULL CHECK(size BETWEEN 1 AND 10485760),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^[a-f0-9-]{36}\.bin$'),
 created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL,
 claimed_at timestamptz(3),
 CHECK((project_id IS NULL)=(claimed_at IS NULL)),
 FOREIGN KEY(version_id,category_id) REFERENCES "public"."project_category_versions"(id,category_id) ON DELETE RESTRICT
);
CREATE INDEX project_attachments_owner_expiry_idx ON "public"."project_attachments"(owner_id,expires_at);
CREATE INDEX project_attachments_project_idx ON "public"."project_attachments"(project_id,created_at,id);
CREATE TABLE "public"."project_attachment_events" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid NOT NULL,
 project_id uuid REFERENCES "public"."project_requests"(id) ON DELETE RESTRICT,
 actor_id uuid REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('UPLOADED','DISCARDED','CLAIMED','DOWNLOADED','EXPIRED')),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX project_attachment_events_file_idx ON "public"."project_attachment_events"(file_id,created_at,id);
CREATE TRIGGER project_attachment_events_immutable BEFORE UPDATE OR DELETE ON "public"."project_attachment_events" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
CREATE FUNCTION "public"."guard_project_attachment"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.project_id IS NOT NULL THEN RAISE EXCEPTION 'Claimed attachment is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.project_id IS NULL OR NEW.claimed_at IS NULL OR (to_jsonb(OLD)-'project_id'-'claimed_at')<>(to_jsonb(NEW)-'project_id'-'claimed_at')) THEN RAISE EXCEPTION 'Invalid attachment claim' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_attachment_guard BEFORE UPDATE OR DELETE ON "public"."project_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_project_attachment"();
