-- AlterTable
ALTER TABLE "ticket_sla_revisions" ADD COLUMN     "carried_seconds" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "continuation_of_id" UUID;

-- CreateTable
CREATE TABLE "shared_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "responsible_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "shared_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurrence_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "added_by_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by_id" UUID,
    "removal_reason" TEXT,

    CONSTRAINT "occurrence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurrence_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "client_message_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_solutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurrence_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurrence_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "message_id" UUID,
    "solution_id" UUID,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurrence_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_solution_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "collective_solution_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics_at_solution" JSONB NOT NULL,
    "validated_at" TIMESTAMPTZ(3),
    "validated_by_id" UUID,
    "decision" TEXT,
    "justification" TEXT,

    CONSTRAINT "ticket_solution_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shared_occurrences_code_key" ON "shared_occurrences"("code");

-- CreateIndex
CREATE INDEX "shared_occurrences_company_id_created_at_idx" ON "shared_occurrences"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "occurrence_links_occurrence_id_ticket_id_idx" ON "occurrence_links"("occurrence_id", "ticket_id");

-- CreateIndex
CREATE INDEX "occurrence_messages_occurrence_id_created_at_idx" ON "occurrence_messages"("occurrence_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "occurrence_messages_occurrence_id_author_id_client_message__key" ON "occurrence_messages"("occurrence_id", "author_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "occurrence_messages_occurrence_id_id_key" ON "occurrence_messages"("occurrence_id", "id");

-- CreateIndex
CREATE INDEX "occurrence_solutions_occurrence_id_created_at_idx" ON "occurrence_solutions"("occurrence_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "occurrence_solutions_occurrence_id_id_key" ON "occurrence_solutions"("occurrence_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "occurrence_attachments_storage_key_key" ON "occurrence_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "occurrence_attachments_occurrence_id_created_at_idx" ON "occurrence_attachments"("occurrence_id", "created_at");

-- CreateIndex
CREATE INDEX "occurrence_events_occurrence_id_created_at_idx" ON "occurrence_events"("occurrence_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_solution_attempts_ticket_id_created_at_idx" ON "ticket_solution_attempts"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_sla_revisions_continuation_of_id_key" ON "ticket_sla_revisions"("continuation_of_id");

-- AddForeignKey
ALTER TABLE "ticket_sla_revisions" ADD CONSTRAINT "ticket_sla_revisions_continuation_of_id_fkey" FOREIGN KEY ("continuation_of_id") REFERENCES "ticket_sla_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shared_occurrences" ADD CONSTRAINT "shared_occurrences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shared_occurrences" ADD CONSTRAINT "shared_occurrences_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shared_occurrences" ADD CONSTRAINT "shared_occurrences_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_links" ADD CONSTRAINT "occurrence_links_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "shared_occurrences"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_links" ADD CONSTRAINT "occurrence_links_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_links" ADD CONSTRAINT "occurrence_links_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_links" ADD CONSTRAINT "occurrence_links_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_messages" ADD CONSTRAINT "occurrence_messages_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "shared_occurrences"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_messages" ADD CONSTRAINT "occurrence_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_solutions" ADD CONSTRAINT "occurrence_solutions_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "shared_occurrences"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_solutions" ADD CONSTRAINT "occurrence_solutions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_attachments" ADD CONSTRAINT "occurrence_attachments_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "shared_occurrences"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_attachments" ADD CONSTRAINT "occurrence_attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_attachments" ADD CONSTRAINT "occurrence_attachments_occurrence_id_message_id_fkey" FOREIGN KEY ("occurrence_id", "message_id") REFERENCES "occurrence_messages"("occurrence_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_attachments" ADD CONSTRAINT "occurrence_attachments_occurrence_id_solution_id_fkey" FOREIGN KEY ("occurrence_id", "solution_id") REFERENCES "occurrence_solutions"("occurrence_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_events" ADD CONSTRAINT "occurrence_events_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "shared_occurrences"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "occurrence_events" ADD CONSTRAINT "occurrence_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_solution_attempts" ADD CONSTRAINT "ticket_solution_attempts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_solution_attempts" ADD CONSTRAINT "ticket_solution_attempts_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "occurrence_links"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_solution_attempts" ADD CONSTRAINT "ticket_solution_attempts_collective_solution_id_fkey" FOREIGN KEY ("collective_solution_id") REFERENCES "occurrence_solutions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_solution_attempts" ADD CONSTRAINT "ticket_solution_attempts_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- statement-breakpoint
-- Only new/nullable structures above. Historical rows are untouched.
CREATE UNIQUE INDEX one_active_occurrence_per_ticket ON occurrence_links(ticket_id) WHERE is_active AND removed_at IS NULL;
CREATE UNIQUE INDEX one_awaiting_validation_per_ticket ON ticket_solution_attempts(ticket_id) WHERE validated_at IS NULL;
ALTER TABLE shared_occurrences ADD CONSTRAINT occurrence_content CHECK (length(btrim(title)) BETWEEN 3 AND 160 AND length(btrim(description)) BETWEEN 1 AND 4000);
ALTER TABLE occurrence_links ADD CONSTRAINT occurrence_link_removal CHECK ((removed_at IS NULL)=(removed_by_id IS NULL) AND (removed_at IS NULL OR (removed_at>=added_at AND NOT is_active AND removal_reason IS NOT NULL AND length(btrim(removal_reason)) BETWEEN 1 AND 2000)));
ALTER TABLE occurrence_messages ADD CONSTRAINT occurrence_message_content CHECK (length(btrim(content)) BETWEEN 1 AND 4000);
ALTER TABLE occurrence_solutions ADD CONSTRAINT occurrence_solution_content CHECK (length(btrim(description)) BETWEEN 1 AND 4000);
ALTER TABLE occurrence_attachments ADD CONSTRAINT occurrence_attachment_shape CHECK (size>0 AND size<=10485760 AND mime IN ('image/png','text/plain') AND sha256 ~ '^[a-f0-9]{64}$' AND storage_key ~ '^[a-f0-9-]{36}\.bin$' AND NOT(message_id IS NOT NULL AND solution_id IS NOT NULL) AND (is_draft OR message_id IS NOT NULL OR solution_id IS NOT NULL) AND (NOT is_draft OR (message_id IS NULL AND solution_id IS NULL)));
ALTER TABLE ticket_solution_attempts ADD CONSTRAINT validation_shape CHECK ((validated_at IS NULL)=(decision IS NULL) AND (validated_at IS NULL)=(validated_by_id IS NULL) AND (validated_at IS NULL OR (validated_at>=created_at AND decision IN ('APPROVE','REJECT'))) AND (decision IS DISTINCT FROM 'REJECT' OR (justification IS NOT NULL AND length(btrim(justification)) BETWEEN 1 AND 2000)) AND jsonb_typeof(metrics_at_solution)='object');
ALTER TABLE ticket_sla_revisions ADD CONSTRAINT carried_sla_valid CHECK ((carried_seconds IS NULL OR (carried_seconds>=0 AND carried_seconds=trunc(carried_seconds) AND carried_seconds<'Infinity'::float8)) AND (continuation_of_id IS NULL OR continuation_of_id<>id));
-- statement-breakpoint
CREATE TRIGGER immutable_occurrence_message BEFORE UPDATE OR DELETE ON "public".occurrence_messages FOR EACH ROW EXECUTE FUNCTION "public".immutable_conversation_record();
CREATE TRIGGER immutable_occurrence_solution BEFORE UPDATE OR DELETE ON "public".occurrence_solutions FOR EACH ROW EXECUTE FUNCTION "public".immutable_conversation_record();
CREATE TRIGGER immutable_occurrence_event BEFORE UPDATE OR DELETE ON "public".occurrence_events FOR EACH ROW EXECUTE FUNCTION "public".immutable_conversation_record();
CREATE TRIGGER immutable_attempt_delete BEFORE DELETE ON "public".ticket_solution_attempts FOR EACH ROW EXECUTE FUNCTION "public".immutable_conversation_record();
-- statement-breakpoint
CREATE FUNCTION "public".guard_occurrence_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE o RECORD; t RECORD;
BEGIN
 SELECT * INTO o FROM "public".shared_occurrences WHERE id=NEW.occurrence_id FOR UPDATE;
 SELECT * INTO t FROM "public".tickets WHERE id=NEW.ticket_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF o.completed_at IS NOT NULL OR t.organization_snapshot->>'companyId' IS DISTINCT FROM o.company_id::text OR t.assigned_technician_id IS DISTINCT FROM o.responsible_id OR t.status::text NOT IN ('OPEN','IN_PROGRESS') OR t.priority IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ineligible occurrence membership'; END IF;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.added_at IS DISTINCT FROM OLD.added_at OR NEW.added_by_id IS DISTINCT FROM OLD.added_by_id OR OLD.removed_at IS NOT NULL OR (NOT OLD.is_active AND NEW.is_active) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Membership history is immutable'; END IF;
  IF NEW.removed_at IS NOT NULL AND EXISTS(SELECT 1 FROM "public".ticket_solution_attempts a WHERE a.link_id=NEW.id AND a.validated_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Pending validation cannot be detached'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER occurrence_link_guard BEFORE INSERT OR UPDATE ON "public".occurrence_links FOR EACH ROW EXECUTE FUNCTION "public".guard_occurrence_link();
-- statement-breakpoint
CREATE FUNCTION "public".guard_solution_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t RECORD; l RECORD; s RECORD;
BEGIN
 SELECT * INTO t FROM "public".tickets WHERE id=NEW.ticket_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  SELECT * INTO l FROM "public".occurrence_links WHERE id=NEW.link_id;
  SELECT * INTO s FROM "public".occurrence_solutions WHERE id=NEW.collective_solution_id;
  IF l.ticket_id IS DISTINCT FROM NEW.ticket_id OR l.occurrence_id IS DISTINCT FROM s.occurrence_id OR NOT l.is_active OR l.removed_at IS NOT NULL OR t.status::text<>'IN_PROGRESS' OR t.first_started_at IS NULL OR NEW.created_at<s.created_at OR NEW.created_at<l.added_at THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid collective solution attempt'; END IF;
 ELSE
  IF OLD.validated_at IS NOT NULL OR NEW.validated_at IS NULL OR NEW.id IS DISTINCT FROM OLD.id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.link_id IS DISTINCT FROM OLD.link_id OR NEW.collective_solution_id IS DISTINCT FROM OLD.collective_solution_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.metrics_at_solution IS DISTINCT FROM OLD.metrics_at_solution OR NEW.validated_by_id IS DISTINCT FROM t.requester_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Validation history is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER solution_attempt_guard BEFORE INSERT OR UPDATE ON "public".ticket_solution_attempts FOR EACH ROW EXECUTE FUNCTION "public".guard_solution_attempt();
-- statement-breakpoint
-- A rejection reopens ONLY its own ticket, preserving first start and assignee.
-- Add and validate the replacement before removing the superseded constraint.
ALTER TABLE tickets ADD CONSTRAINT ticket_state_integrity_v3 CHECK (
 (status::text<>'OPEN' OR (closed_at IS NULL AND (assigned_technician_id IS NULL OR priority IS NOT NULL) AND (first_started_at IS NULL OR (assigned_technician_id IS NOT NULL AND priority IS NOT NULL))))
 AND (status::text NOT IN ('IN_PROGRESS','PENDING') OR (assigned_technician_id IS NOT NULL AND priority IS NOT NULL AND first_started_at IS NOT NULL))
 AND (status::text<>'CLOSED' OR closed_at IS NOT NULL)
) NOT VALID;
ALTER TABLE tickets VALIDATE CONSTRAINT ticket_state_integrity_v3;
ALTER TABLE tickets DROP CONSTRAINT ticket_state_integrity_v2;
ALTER TABLE tickets ADD CONSTRAINT resolved_state_integrity_v2 CHECK (
 (status::text<>'RESOLVED' OR (assigned_technician_id IS NOT NULL AND priority IS NOT NULL AND first_started_at IS NOT NULL AND resolved_at>=first_started_at AND resolved_at IS NOT NULL AND closed_at IS NULL))
 AND (resolved_at IS NULL OR resolved_at>=first_started_at)
) NOT VALID;
ALTER TABLE tickets VALIDATE CONSTRAINT resolved_state_integrity_v2;
ALTER TABLE tickets DROP CONSTRAINT resolved_state_integrity;
-- statement-breakpoint
CREATE FUNCTION "public".guard_validated_reopening() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a RECORD;
BEGIN
 IF OLD.first_started_at IS NOT NULL AND (NEW.first_started_at IS DISTINCT FROM OLD.first_started_at OR NEW.assigned_technician_id IS DISTINCT FROM OLD.assigned_technician_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Historical first start and assignment are immutable'; END IF;
 IF OLD.resolved_at IS NOT NULL AND NEW.resolved_at IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Historical solution timestamp cannot be cleared'; END IF;
 SELECT * INTO a FROM "public".ticket_solution_attempts WHERE ticket_id=NEW.id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NEW.status::text='OPEN' AND NEW.first_started_at IS NOT NULL AND (a.id IS NULL OR a.decision IS DISTINCT FROM 'REJECT' OR (OLD.status::text<>'OPEN' AND OLD.status::text<>'RESOLVED')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Reopening requires individual rejection'; END IF;
 IF NEW.status::text='CLOSED' AND a.id IS NOT NULL AND a.decision IS DISTINCT FROM 'APPROVE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Individual validation is required'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER validated_reopening_guard BEFORE UPDATE ON "public".tickets FOR EACH ROW EXECUTE FUNCTION "public".guard_validated_reopening();
-- statement-breakpoint
CREATE FUNCTION "public".guard_sla_continuation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prior RECORD;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.carried_seconds IS DISTINCT FROM OLD.carried_seconds OR NEW.continuation_of_id IS DISTINCT FROM OLD.continuation_of_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Carried SLA history is immutable'; END IF;
 IF TG_OP='INSERT' AND NEW.continuation_of_id IS NOT NULL THEN
 SELECT * INTO prior FROM "public".ticket_sla_revisions WHERE id=NEW.continuation_of_id FOR SHARE;
 IF prior.ticket_id IS DISTINCT FROM NEW.ticket_id OR prior.priority IS DISTINCT FROM NEW.priority OR prior.policy_version_id IS DISTINCT FROM NEW.policy_version_id OR prior.finish_reason IS DISTINCT FROM 'SOLUTION' OR prior.ended_at IS NULL OR NEW.carried_seconds IS DISTINCT FROM prior.consumed_seconds OR NEW.started_at<prior.ended_at THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid SLA continuation'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER sla_continuation_guard BEFORE INSERT OR UPDATE ON "public".ticket_sla_revisions FOR EACH ROW EXECUTE FUNCTION "public".guard_sla_continuation();
-- statement-breakpoint
CREATE FUNCTION "public".guard_occurrence_attachment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT OLD.is_draft THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Confirmed collective attachments are immutable'; END IF;
  RETURN OLD;
 END IF;
 IF NOT OLD.is_draft OR NEW.is_draft OR NEW.id IS DISTINCT FROM OLD.id OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id OR NEW.uploader_id IS DISTINCT FROM OLD.uploader_id OR NEW.name IS DISTINCT FROM OLD.name OR NEW.mime IS DISTINCT FROM OLD.mime OR NEW.size IS DISTINCT FROM OLD.size OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Collective attachment history is immutable'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER occurrence_attachment_guard BEFORE UPDATE OR DELETE ON "public".occurrence_attachments FOR EACH ROW EXECUTE FUNCTION "public".guard_occurrence_attachment();
CREATE TRIGGER immutable_occurrence_link_delete BEFORE DELETE ON "public".occurrence_links FOR EACH ROW EXECUTE FUNCTION "public".immutable_conversation_record();
