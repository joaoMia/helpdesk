-- Checkpoint 1: reviewed evolution; existing rows remain unchanged.
BEGIN;
-- statement-breakpoint
ALTER TABLE "public"."tickets" ADD CONSTRAINT ticket_state_integrity_v2 CHECK (
 (status <> 'OPEN' OR (first_started_at IS NULL AND closed_at IS NULL AND (assigned_technician_id IS NULL OR priority IS NOT NULL)))
 AND (status NOT IN ('IN_PROGRESS','PENDING') OR (assigned_technician_id IS NOT NULL AND priority IS NOT NULL AND first_started_at IS NOT NULL))
 AND (status <> 'CLOSED' OR closed_at IS NOT NULL)
) NOT VALID;
-- statement-breakpoint
ALTER TABLE "public"."tickets" VALIDATE CONSTRAINT ticket_state_integrity_v2;
-- statement-breakpoint
ALTER TABLE "public"."tickets" DROP CONSTRAINT ticket_state_integrity;
-- statement-breakpoint
COMMIT;
