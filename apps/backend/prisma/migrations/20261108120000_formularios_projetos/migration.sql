CREATE TABLE "public"."project_categories" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_key text UNIQUE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 is_active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX project_categories_name_idx ON "public"."project_categories"(lower(btrim(name)));
CREATE TABLE "public"."project_category_drafts" (
 category_id uuid PRIMARY KEY REFERENCES "public"."project_categories"(id) ON DELETE RESTRICT,
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 revision integer NOT NULL CHECK(revision>0), published_revision integer,
 actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 updated_at timestamptz(3) NOT NULL
);
CREATE TABLE "public"."project_category_versions" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category_id uuid NOT NULL REFERENCES "public"."project_categories"(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0), definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL, UNIQUE(category_id,version), UNIQUE(id,category_id)
);
CREATE TABLE "public"."project_form_submissions" (
 project_id uuid PRIMARY KEY REFERENCES "public"."project_requests"(id) ON DELETE RESTRICT,
 category_id uuid NOT NULL REFERENCES "public"."project_categories"(id) ON DELETE RESTRICT,
 version_id uuid NOT NULL, snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object'),
 FOREIGN KEY(version_id,category_id) REFERENCES "public"."project_category_versions"(id,category_id) ON DELETE RESTRICT
);
CREATE TABLE "public"."project_catalog_events" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES "public"."project_categories"(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('CREATED','UPDATED','DRAFT_SAVED','PUBLISHED')),
 details jsonb NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX project_catalog_events_category_idx ON "public"."project_catalog_events"(category_id,created_at,id);
CREATE INDEX project_categories_active_idx ON "public"."project_categories"(is_active,name,id);
CREATE TRIGGER project_category_versions_immutable BEFORE UPDATE OR DELETE ON "public"."project_category_versions" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
CREATE TRIGGER project_submissions_immutable BEFORE UPDATE OR DELETE ON "public"."project_form_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
CREATE TRIGGER project_catalog_events_immutable BEFORE UPDATE OR DELETE ON "public"."project_catalog_events" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
