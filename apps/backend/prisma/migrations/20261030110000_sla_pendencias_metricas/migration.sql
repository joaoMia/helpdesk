BEGIN;
-- statement-breakpoint
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "final_metrics" JSONB;

-- CreateTable
CREATE TABLE "pending_reasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "counts_toward_solution" BOOLEAN NOT NULL DEFAULT false,
    "auto_resume_on_requester_activity" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_pending_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "reason_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "justification" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "started_by_id" UUID NOT NULL,
    "ended_by_id" UUID,

    CONSTRAINT "ticket_pending_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "priority" "TicketPriority" NOT NULL,
    "version" INTEGER NOT NULL,
    "target_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_sla_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "consumed_seconds" DOUBLE PRECISION,
    "met" BOOLEAN,
    "finish_reason" TEXT,

    CONSTRAINT "ticket_sla_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_pending_periods_ticket_id_starts_at_idx" ON "ticket_pending_periods"("ticket_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policy_versions_priority_version_key" ON "sla_policy_versions"("priority", "version");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policy_versions_id_priority_key" ON "sla_policy_versions"("id", "priority");

-- CreateIndex
CREATE INDEX "ticket_sla_revisions_ticket_id_created_at_idx" ON "ticket_sla_revisions"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "ticket_pending_periods" ADD CONSTRAINT "ticket_pending_periods_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_pending_periods" ADD CONSTRAINT "ticket_pending_periods_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "pending_reasons"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_pending_periods" ADD CONSTRAINT "ticket_pending_periods_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_pending_periods" ADD CONSTRAINT "ticket_pending_periods_ended_by_id_fkey" FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_sla_revisions" ADD CONSTRAINT "ticket_sla_revisions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_sla_revisions" ADD CONSTRAINT "ticket_sla_revisions_policy_version_id_priority_fkey" FOREIGN KEY ("policy_version_id", "priority") REFERENCES "sla_policy_versions"("id", "priority") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- statement-breakpoint
INSERT INTO "sla_policy_versions" (priority,version,target_minutes) VALUES ('LOW',1,2400),('MEDIUM',1,960),('HIGH',1,480);
ALTER TABLE "sla_policy_versions" ADD CONSTRAINT sla_policy_positive CHECK (version>0 AND target_minutes BETWEEN 1 AND 525600);
ALTER TABLE "pending_reasons" ADD CONSTRAINT reason_name_valid CHECK (length(btrim(name)) BETWEEN 2 AND 160);
ALTER TABLE "ticket_pending_periods" ADD CONSTRAINT pending_period_valid CHECK ((ends_at IS NULL OR ends_at>=starts_at) AND (ends_at IS NULL)=(ended_by_id IS NULL) AND length(btrim(justification)) BETWEEN 1 AND 2000 AND jsonb_typeof(snapshot)='object' AND jsonb_typeof(snapshot->'name')='string' AND jsonb_typeof(snapshot->'countsTowardSolution')='boolean' AND jsonb_typeof(snapshot->'autoResumeOnRequesterActivity')='boolean');
CREATE UNIQUE INDEX one_active_pending_period ON "ticket_pending_periods" (ticket_id) WHERE ends_at IS NULL;
CREATE UNIQUE INDEX one_active_sla_revision ON "ticket_sla_revisions" (ticket_id) WHERE ended_at IS NULL;
ALTER TABLE "ticket_sla_revisions" ADD CONSTRAINT sla_revision_valid CHECK (
 (started_at IS NULL OR started_at>=created_at) AND (ended_at IS NULL OR ended_at>=coalesce(started_at,created_at))
 AND (consumed_seconds IS NULL OR (consumed_seconds>=0 AND consumed_seconds=trunc(consumed_seconds) AND consumed_seconds<'Infinity'::float8))
 AND (ended_at IS NOT NULL OR (consumed_seconds IS NULL AND met IS NULL AND finish_reason IS NULL))
 AND (ended_at IS NULL OR finish_reason IN ('PRIORITY_CHANGED','SOLUTION'))
);
-- statement-breakpoint
CREATE TRIGGER immutable_sla_policy BEFORE UPDATE OR DELETE ON "public"."sla_policy_versions" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
-- statement-breakpoint
CREATE FUNCTION "public"."guard_pending_period"() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM id FROM "public"."tickets" WHERE id=NEW.ticket_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (OLD.ends_at IS NOT NULL OR NEW.ends_at IS NULL OR NEW.id IS DISTINCT FROM OLD.id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.reason_id IS DISTINCT FROM OLD.reason_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.justification IS DISTINCT FROM OLD.justification OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.started_by_id IS DISTINCT FROM OLD.started_by_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Pending history is immutable'; END IF;
 IF EXISTS(SELECT 1 FROM "public"."ticket_pending_periods" p WHERE p.ticket_id=NEW.ticket_id AND p.id<>NEW.id AND p.starts_at<coalesce(NEW.ends_at,'infinity'::timestamptz) AND coalesce(p.ends_at,'infinity'::timestamptz)>NEW.starts_at) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Overlapping pending periods'; END IF;
 RETURN NEW;
END;
$$;
-- statement-breakpoint
CREATE TRIGGER pending_history_guard BEFORE INSERT OR UPDATE ON "public"."ticket_pending_periods" FOR EACH ROW EXECUTE FUNCTION "public"."guard_pending_period"();
-- statement-breakpoint
CREATE FUNCTION "public"."guard_sla_revision"() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.ended_at IS NOT NULL OR NEW.id IS DISTINCT FROM OLD.id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR (OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='SLA history is immutable'; END IF; RETURN NEW;
END;
$$;
-- statement-breakpoint
CREATE TRIGGER sla_history_guard BEFORE UPDATE ON "public"."ticket_sla_revisions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_sla_revision"();
-- statement-breakpoint
CREATE FUNCTION "public"."guard_final_metrics"() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (OLD.status::text='CLOSED' AND NEW IS DISTINCT FROM OLD) OR (OLD.final_metrics IS NOT NULL AND NEW.final_metrics IS DISTINCT FROM OLD.final_metrics) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Closed ticket metrics are immutable'; END IF;
 IF NEW.final_metrics IS NOT NULL AND (NEW.status::text<>'CLOSED' OR jsonb_typeof(NEW.final_metrics)<>'object' OR NEW.final_metrics->>'complete' IS DISTINCT FROM 'true' OR jsonb_typeof(NEW.final_metrics->'aSeconds') IS DISTINCT FROM 'number' OR jsonb_typeof(NEW.final_metrics->'bSeconds') IS DISTINCT FROM 'number') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Complete final metrics are required'; END IF;
 RETURN NEW;
END;
$$;
-- statement-breakpoint
CREATE TRIGGER final_metrics_guard BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."guard_final_metrics"();
-- statement-breakpoint
COMMIT;
