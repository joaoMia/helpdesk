-- Additive v1.0 homologation corrections: project priority/retirement and checkbox groups.
ALTER TYPE "ServiceFieldType" ADD VALUE 'CHECKBOX_GROUP';
ALTER TABLE project_requests ADD COLUMN priority varchar(6);
ALTER TABLE project_requests ADD CONSTRAINT project_requests_priority_check
  CHECK (priority IS NULL OR priority IN ('HIGH', 'MEDIUM', 'LOW'));
CREATE FUNCTION guard_project_priority_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR (to_jsonb(OLD) - 'priority') <> (to_jsonb(NEW) - 'priority') THEN
    RAISE EXCEPTION 'Project request snapshot is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER immutable_project_requests ON project_requests;
CREATE TRIGGER immutable_project_requests BEFORE UPDATE OR DELETE ON project_requests
  FOR EACH ROW EXECUTE FUNCTION guard_project_priority_change();
ALTER TABLE operational_retirements ADD COLUMN project_id uuid UNIQUE
  REFERENCES project_requests(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE operational_retirements DROP CONSTRAINT retirement_one_target;
ALTER TABLE operational_retirements ADD CONSTRAINT retirement_one_target
  CHECK (num_nonnulls(ticket_id, service_id, category_id, project_id) = 1);
ALTER TABLE project_workflow_events DROP CONSTRAINT project_workflow_events_kind_check;
ALTER TABLE project_workflow_events ADD CONSTRAINT project_workflow_events_kind_check
  CHECK (kind IN ('ASSIGNED', 'REASSIGNED', 'PLANNING', 'DRAFT_SAVED', 'PLAN_PUBLISHED', 'PLAN_REVISED', 'STARTED', 'ACTIVITY_CHANGED', 'REWORK', 'UPDATE_ADDED', 'COMPLETED', 'CANCELED', 'PRIORITY_CHANGED', 'DRAFT_DELETED', 'RETIRED'));
