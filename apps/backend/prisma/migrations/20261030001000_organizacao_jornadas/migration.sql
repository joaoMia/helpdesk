-- Checkpoint 2: nullable additions and new structures; no backfill of organizational history.
BEGIN;
-- statement-breakpoint
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company_id" UUID,
ADD COLUMN     "department_id" UUID,
ADD COLUMN     "username" TEXT,
ADD COLUMN     "work_schedule_id" UUID;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "organization_snapshot" JSONB;

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "work_schedule_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "weekly" JSONB NOT NULL,
    "exceptions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_schedule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "work_schedule_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_calendar_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),

    CONSTRAINT "ticket_calendar_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departments_company_id_is_active_idx" ON "departments"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "departments_company_id_id_key" ON "departments"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_versions_schedule_id_version_key" ON "work_schedule_versions"("schedule_id", "version");

-- CreateIndex
CREATE INDEX "ticket_calendar_segments_ticket_id_starts_at_idx" ON "ticket_calendar_segments"("ticket_id", "starts_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_resource_type_resource_id_created_at_idx" ON "admin_audit_events"("resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_department_id_fkey" FOREIGN KEY ("company_id", "department_id") REFERENCES "departments"("company_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_work_schedule_id_fkey" FOREIGN KEY ("work_schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_work_schedule_id_fkey" FOREIGN KEY ("work_schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_schedule_versions" ADD CONSTRAINT "work_schedule_versions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_work_schedule_id_fkey" FOREIGN KEY ("work_schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_calendar_segments" ADD CONSTRAINT "ticket_calendar_segments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_calendar_segments" ADD CONSTRAINT "ticket_calendar_segments_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "work_schedule_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- statement-breakpoint
ALTER TABLE "public"."users" ADD CONSTRAINT user_department_requires_company CHECK (department_id IS NULL OR company_id IS NOT NULL);
ALTER TABLE "public"."users" ADD CONSTRAINT username_normalized CHECK (username IS NULL OR (username=lower(username) AND username ~ '^[a-z][a-z0-9_.-]{2,39}$'));
ALTER TABLE "public"."tickets" ADD CONSTRAINT organization_snapshot_object CHECK (organization_snapshot IS NULL OR jsonb_typeof(organization_snapshot)='object');
ALTER TABLE "public"."work_schedule_versions" ADD CONSTRAINT schedule_version_shape CHECK (version>0 AND jsonb_typeof(weekly)='array' AND jsonb_typeof(exceptions)='array');
ALTER TABLE "public"."ticket_calendar_segments" ADD CONSTRAINT segment_positive CHECK (ends_at IS NULL OR ends_at>=starts_at);
CREATE UNIQUE INDEX one_open_calendar_segment ON "public"."ticket_calendar_segments" (ticket_id) WHERE ends_at IS NULL;
-- statement-breakpoint
CREATE FUNCTION "public"."guard_schedule_version"() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Schedule versions are immutable'; END;
$$;
-- statement-breakpoint
CREATE TRIGGER immutable_schedule_version BEFORE UPDATE OR DELETE ON "public"."work_schedule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_schedule_version"();
-- statement-breakpoint
CREATE FUNCTION "public"."guard_organization_snapshot"() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF NEW.organization_snapshot IS DISTINCT FROM OLD.organization_snapshot THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Organizational history is immutable'; END IF; RETURN NEW; END;
$$;
-- statement-breakpoint
CREATE TRIGGER immutable_organization_snapshot BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."guard_organization_snapshot"();
-- statement-breakpoint
CREATE FUNCTION "public"."guard_calendar_segment"() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM id FROM "public"."tickets" WHERE id=NEW.ticket_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR OLD.ends_at IS NOT NULL OR NEW.ends_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Calendar segment history is immutable'; END IF;
 IF EXISTS(SELECT 1 FROM "public"."ticket_calendar_segments" s WHERE s.ticket_id=NEW.ticket_id AND s.id<>NEW.id AND s.starts_at<coalesce(NEW.ends_at,'infinity'::timestamptz) AND coalesce(s.ends_at,'infinity'::timestamptz)>NEW.starts_at) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Overlapping calendar segments'; END IF;
 RETURN NEW;
END;
$$;
-- statement-breakpoint
CREATE TRIGGER calendar_segment_integrity BEFORE INSERT OR UPDATE ON "public"."ticket_calendar_segments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_calendar_segment"();
-- statement-breakpoint
COMMIT;
