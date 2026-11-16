ALTER TYPE "public"."ServiceFieldType" ADD VALUE 'NUMBER';
-- statement-breakpoint
ALTER TYPE "public"."ServiceFieldType" ADD VALUE 'DATE';
-- statement-breakpoint
ALTER TYPE "public"."ServiceFieldType" ADD VALUE 'EMAIL';
-- statement-breakpoint
ALTER TYPE "public"."ServiceFieldType" ADD VALUE 'URL';
-- statement-breakpoint
ALTER TABLE "public"."service_form_versions" ADD COLUMN title TEXT NOT NULL DEFAULT '',ADD COLUMN description TEXT NOT NULL DEFAULT '';
-- statement-breakpoint
ALTER TABLE "public"."service_form_fields" ADD COLUMN help TEXT NOT NULL DEFAULT '',ADD COLUMN description TEXT NOT NULL DEFAULT '';
-- statement-breakpoint
CREATE TABLE "public"."service_form_drafts"(service_id UUID PRIMARY KEY REFERENCES "public"."services"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),published_revision INTEGER NOT NULL DEFAULT 0 CHECK(published_revision>=0 AND published_revision<=revision),definition JSONB NOT NULL CHECK(jsonb_typeof(definition)='object'),updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- statement-breakpoint
CREATE FUNCTION "public".guard_published_form() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent_id uuid; creator bigint;
BEGIN
 IF TG_TABLE_NAME='service_form_versions' THEN parent_id=OLD.id;
 ELSE parent_id=CASE WHEN TG_OP='DELETE' THEN OLD.form_version_id ELSE NEW.form_version_id END; END IF;
 SELECT xmin::text::bigint INTO creator FROM "public".service_form_versions WHERE id=parent_id;
 IF creator IS DISTINCT FROM (txid_current()%4294967296) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Published form is immutable; create a new version'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
-- statement-breakpoint
CREATE TRIGGER published_version_readonly BEFORE UPDATE OR DELETE ON "public".service_form_versions FOR EACH ROW EXECUTE FUNCTION "public".guard_published_form();
-- statement-breakpoint
CREATE TRIGGER published_fields_readonly BEFORE INSERT OR UPDATE OR DELETE ON "public".service_form_fields FOR EACH ROW EXECUTE FUNCTION "public".guard_published_form();
