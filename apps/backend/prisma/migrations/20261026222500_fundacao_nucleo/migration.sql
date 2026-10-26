-- DEV-002: generated without applying via Prisma migrate diff --from-empty --script.
-- Statement boundaries are also used by isolated integration tests.
BEGIN;

-- statement-breakpoint

SET LOCAL search_path TO "public", pg_catalog;

-- statement-breakpoint

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- statement-breakpoint

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TECHNICIAN', 'REQUESTER');

-- statement-breakpoint

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING', 'CLOSED');

-- statement-breakpoint

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- statement-breakpoint

-- CreateEnum
CREATE TYPE "ServiceFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'SELECT', 'MULTI_SELECT', 'DATE_TIME', 'FILE', 'CHECKBOX');

-- statement-breakpoint

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateTable
CREATE TABLE "service_form_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_form_versions_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateTable
CREATE TABLE "service_form_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "form_version_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ServiceFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "condition" JSONB,

    CONSTRAINT "service_form_fields_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" SERIAL NOT NULL,
    "requester_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority",
    "assigned_technician_id" UUID,
    "classified_at" TIMESTAMPTZ(3),
    "classified_by_id" UUID,
    "first_started_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_id" UUID,
    "service_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateTable
CREATE TABLE "ticket_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_answers_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- statement-breakpoint

-- CreateIndex
CREATE INDEX "services_category_id_is_active_display_order_idx" ON "services"("category_id", "is_active", "display_order");

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "service_form_versions_service_id_version_key" ON "service_form_versions"("service_id", "version");

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "service_form_versions_service_id_id_key" ON "service_form_versions"("service_id", "id");

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "service_form_fields_form_version_id_key_key" ON "service_form_fields"("form_version_id", "key");

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "service_form_fields_form_version_id_id_key_key" ON "service_form_fields"("form_version_id", "id", "key");

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "tickets_code_key" ON "tickets"("code");

-- statement-breakpoint

-- CreateIndex
CREATE INDEX "tickets_requester_id_created_at_idx" ON "tickets"("requester_id", "created_at");

-- statement-breakpoint

-- CreateIndex
CREATE INDEX "tickets_status_priority_created_at_idx" ON "tickets"("status", "priority", "created_at");

-- statement-breakpoint

-- CreateIndex
CREATE INDEX "tickets_assigned_technician_id_status_idx" ON "tickets"("assigned_technician_id", "status");

-- statement-breakpoint

-- CreateIndex
CREATE INDEX "tickets_service_id_form_version_id_idx" ON "tickets"("service_id", "form_version_id");

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "tickets_id_form_version_id_key" ON "tickets"("id", "form_version_id");

-- statement-breakpoint

-- CreateIndex
CREATE INDEX "ticket_answers_form_version_id_field_id_field_key_idx" ON "ticket_answers"("form_version_id", "field_id", "field_key");

-- statement-breakpoint

-- CreateIndex
CREATE UNIQUE INDEX "ticket_answers_ticket_id_field_key_key" ON "ticket_answers"("ticket_id", "field_key");

-- statement-breakpoint

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "service_form_versions" ADD CONSTRAINT "service_form_versions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "service_form_fields" ADD CONSTRAINT "service_form_fields_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "service_form_versions"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_service_id_form_version_id_fkey" FOREIGN KEY ("service_id", "form_version_id") REFERENCES "service_form_versions"("service_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_classified_by_id_fkey" FOREIGN KEY ("classified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "ticket_answers" ADD CONSTRAINT "ticket_answers_ticket_id_form_version_id_fkey" FOREIGN KEY ("ticket_id", "form_version_id") REFERENCES "tickets"("id", "form_version_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "ticket_answers" ADD CONSTRAINT "ticket_answers_form_version_id_field_id_field_key_fkey" FOREIGN KEY ("form_version_id", "field_id", "field_key") REFERENCES "service_form_fields"("form_version_id", "id", "key") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- statement-breakpoint

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- statement-breakpoint

-- PostgreSQL guarantees not representable in PSL; applied with the same migration.
CREATE UNIQUE INDEX users_email_case_insensitive ON "public"."users" (lower(email));

-- statement-breakpoint

ALTER TABLE "public"."service_form_versions" ADD CONSTRAINT form_version_positive CHECK (version > 0);

-- statement-breakpoint

ALTER TABLE "public"."service_form_fields" ADD CONSTRAINT form_field_data_shape CHECK (
  key ~ '^[a-zA-Z][a-zA-Z0-9_]*$' AND key NOT IN ('constructor', 'prototype', '__proto__')
  AND (options IS NULL OR jsonb_typeof(options) = 'array')
  AND (condition IS NULL OR jsonb_typeof(condition) = 'object')
);

-- statement-breakpoint

ALTER TABLE "public"."tickets" ADD CONSTRAINT ticket_state_integrity CHECK (
  (status <> 'OPEN' OR (assigned_technician_id IS NULL AND first_started_at IS NULL AND closed_at IS NULL))
  AND (status NOT IN ('IN_PROGRESS', 'PENDING') OR (assigned_technician_id IS NOT NULL AND priority IS NOT NULL AND first_started_at IS NOT NULL))
  AND (status <> 'CLOSED' OR closed_at IS NOT NULL)
);

-- statement-breakpoint

ALTER TABLE "public"."tickets" ADD CONSTRAINT ticket_snapshot_identity CHECK (
  jsonb_typeof(service_snapshot) = 'object'
  AND service_snapshot ? 'serviceId' AND service_snapshot ? 'formVersionId'
  AND COALESCE(service_snapshot ->> 'serviceId' = service_id::text, false)
  AND COALESCE(service_snapshot ->> 'formVersionId' = form_version_id::text, false)
);

-- statement-breakpoint

-- No dynamic SQL, eval, expressions from form data, or elevated privileges.
-- The version lock serializes first use with definition edits. Backend opening
-- also uses SERIALIZABLE so catalog/answers/snapshot are read consistently.
CREATE FUNCTION "public"."guard_ticket_history"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' OR NEW.priority IS NOT NULL
      OR NEW.assigned_technician_id IS NOT NULL OR NEW.first_started_at IS NOT NULL
      OR NEW.classified_at IS NOT NULL OR NEW.classified_by_id IS NOT NULL
      OR NEW.closed_at IS NOT NULL OR NEW.closed_by_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid initial ticket state';
    END IF;
    PERFORM 1 FROM "public"."service_form_versions"
      WHERE id = NEW.form_version_id FOR SHARE;
  ELSIF NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.form_version_id IS DISTINCT FROM OLD.form_version_id
    OR NEW.service_snapshot IS DISTINCT FROM OLD.service_snapshot
    OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Ticket historical identity is immutable';
  END IF;
  RETURN NEW;
END;
$guard$;

-- statement-breakpoint

CREATE TRIGGER ticket_history_guard BEFORE INSERT OR UPDATE ON "public"."tickets"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_ticket_history"();

-- statement-breakpoint

CREATE FUNCTION "public"."guard_used_form_version"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."tickets" WHERE form_version_id = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Used form version is immutable; create a new version';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard$;

-- statement-breakpoint

CREATE TRIGGER used_form_version_guard BEFORE UPDATE OR DELETE ON "public"."service_form_versions"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_used_form_version"();

-- statement-breakpoint

CREATE FUNCTION "public"."guard_used_form_fields"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM 1 FROM "public"."service_form_versions" WHERE id = OLD.form_version_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM "public"."tickets" WHERE form_version_id = OLD.form_version_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Used form fields are immutable; create a new version';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM 1 FROM "public"."service_form_versions" WHERE id = NEW.form_version_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM "public"."tickets" WHERE form_version_id = NEW.form_version_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Used form fields are immutable; create a new version';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$guard$;

-- statement-breakpoint

CREATE TRIGGER used_form_fields_guard BEFORE INSERT OR UPDATE OR DELETE ON "public"."service_form_fields"
FOR EACH ROW EXECUTE FUNCTION "public"."guard_used_form_fields"();

-- statement-breakpoint

COMMIT;
