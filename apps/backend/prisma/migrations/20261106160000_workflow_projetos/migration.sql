CREATE TABLE "public"."project_workflows" (
 project_id uuid PRIMARY KEY REFERENCES "public"."project_requests"(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','PLANNING','IN_PROGRESS','COMPLETED','CANCELED')),
 owner_id uuid REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 started_at timestamptz(3), completed_at timestamptz(3), canceled_at timestamptz(3),
 CHECK(state NOT IN ('PLANNING','IN_PROGRESS','COMPLETED') OR owner_id IS NOT NULL),
 CHECK((state IN ('IN_PROGRESS','COMPLETED'))=(started_at IS NOT NULL) OR state='CANCELED'),
 CHECK((state='COMPLETED')=(completed_at IS NOT NULL)),
 CHECK((state='CANCELED')=(canceled_at IS NOT NULL))
);
CREATE INDEX project_workflows_owner_state_idx ON "public"."project_workflows"(owner_id,state);
CREATE TABLE "public"."project_plan_drafts" (
 project_id uuid PRIMARY KEY REFERENCES "public"."project_workflows"(project_id) ON DELETE RESTRICT,
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 updated_at timestamptz(3) NOT NULL, actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT
);
CREATE TABLE "public"."project_plan_versions" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES "public"."project_workflows"(project_id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0), sealed boolean NOT NULL DEFAULT false,
 created_at timestamptz(3) NOT NULL, actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 UNIQUE(project_id,version), UNIQUE(id,project_id)
);
CREATE TABLE "public"."project_plan_stages" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES "public"."project_plan_versions"(id) ON DELETE RESTRICT,
 logical_id uuid NOT NULL, position integer NOT NULL CHECK(position BETWEEN 1 AND 25),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160), description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 UNIQUE(plan_id,logical_id), UNIQUE(plan_id,position), UNIQUE(id,plan_id)
);
CREATE TABLE "public"."project_activity_states" (
 project_id uuid NOT NULL REFERENCES "public"."project_workflows"(project_id) ON DELETE RESTRICT,
 logical_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'TODO' CHECK(state IN ('TODO','IN_PROGRESS','DONE')),
 updated_at timestamptz(3) NOT NULL, actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 PRIMARY KEY(project_id,logical_id)
);
CREATE TABLE "public"."project_plan_activities" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL, stage_id uuid NOT NULL, project_id uuid NOT NULL, logical_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 200),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160), description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 FOREIGN KEY(plan_id,project_id) REFERENCES "public"."project_plan_versions"(id,project_id) ON DELETE RESTRICT,
 FOREIGN KEY(stage_id,plan_id) REFERENCES "public"."project_plan_stages"(id,plan_id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,logical_id) REFERENCES "public"."project_activity_states"(project_id,logical_id) ON DELETE RESTRICT,
 UNIQUE(plan_id,logical_id), UNIQUE(stage_id,position)
);
CREATE INDEX project_activities_project_idx ON "public"."project_plan_activities"(project_id,plan_id);
CREATE TABLE "public"."project_workflow_updates" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES "public"."project_workflows"(project_id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 4000),
 correction_of uuid REFERENCES "public"."project_workflow_updates"(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0), created_at timestamptz(3) NOT NULL
);
CREATE INDEX project_updates_page_idx ON "public"."project_workflow_updates"(project_id,created_at,id);
CREATE TABLE "public"."project_workflow_events" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES "public"."project_workflows"(project_id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('ASSIGNED','REASSIGNED','PLANNING','DRAFT_SAVED','PLAN_PUBLISHED','PLAN_REVISED','STARTED','ACTIVITY_CHANGED','REWORK','UPDATE_ADDED','COMPLETED','CANCELED')),
 summary text NOT NULL, details jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL CHECK(revision>0), created_at timestamptz(3) NOT NULL,
 UNIQUE(project_id,revision)
);
CREATE INDEX project_events_page_idx ON "public"."project_workflow_events"(project_id,created_at,id);
CREATE TABLE "public"."project_operations" (
 actor_id uuid NOT NULL REFERENCES "public"."users"(id) ON DELETE RESTRICT,
 operation_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES "public"."project_requests"(id) ON DELETE RESTRICT,
 payload_hash text NOT NULL CHECK(length(payload_hash)=64), result jsonb NOT NULL, created_at timestamptz(3) NOT NULL,
 PRIMARY KEY(actor_id,operation_id)
);
CREATE INDEX project_operations_project_idx ON "public"."project_operations"(project_id);
CREATE TRIGGER project_events_immutable BEFORE UPDATE OR DELETE ON "public"."project_workflow_events" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
CREATE TRIGGER project_updates_immutable BEFORE UPDATE OR DELETE ON "public"."project_workflow_updates" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
CREATE TRIGGER project_operations_immutable BEFORE UPDATE OR DELETE ON "public"."project_operations" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
CREATE FUNCTION "public"."guard_project_plan"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (OLD.sealed OR NOT NEW.sealed OR (to_jsonb(OLD)-'sealed')<>(to_jsonb(NEW)-'sealed'))) OR (TG_OP='INSERT' AND NEW.sealed) THEN
  RAISE EXCEPTION 'Published plan is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_plan_guard BEFORE INSERT OR UPDATE OR DELETE ON "public"."project_plan_versions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_project_plan"();
CREATE FUNCTION "public"."guard_project_definition"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Published definitions are immutable' USING ERRCODE='23514'; END IF;
 IF (SELECT sealed FROM "public"."project_plan_versions" WHERE id=NEW.plan_id) THEN RAISE EXCEPTION 'Plan already sealed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_stage_guard BEFORE INSERT OR UPDATE OR DELETE ON "public"."project_plan_stages" FOR EACH ROW EXECUTE FUNCTION "public"."guard_project_definition"();
CREATE TRIGGER project_activity_guard BEFORE INSERT OR UPDATE OR DELETE ON "public"."project_plan_activities" FOR EACH ROW EXECUTE FUNCTION "public"."guard_project_definition"();
CREATE FUNCTION "public"."guard_project_workflow"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Workflow cannot be deleted' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('COMPLETED','CANCELED') OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Terminal or stale workflow' USING ERRCODE='23514'; END IF;
 IF NEW.state<>OLD.state AND NOT ((OLD.state='REQUESTED' AND NEW.state IN ('PLANNING','CANCELED')) OR (OLD.state='PLANNING' AND NEW.state IN ('IN_PROGRESS','CANCELED')) OR (OLD.state='IN_PROGRESS' AND NEW.state IN ('COMPLETED','CANCELED'))) THEN RAISE EXCEPTION 'Invalid transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_workflow_guard BEFORE UPDATE OR DELETE ON "public"."project_workflows" FOR EACH ROW EXECUTE FUNCTION "public"."guard_project_workflow"();
CREATE FUNCTION "public"."guard_project_activity_state"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Execution history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (SELECT state FROM "public"."project_workflows" WHERE project_id=NEW.project_id) IN ('COMPLETED','CANCELED') THEN RAISE EXCEPTION 'Terminal project' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_execution_guard BEFORE INSERT OR UPDATE OR DELETE ON "public"."project_activity_states" FOR EACH ROW EXECUTE FUNCTION "public"."guard_project_activity_state"();
CREATE FUNCTION "public"."check_project_plan_publication"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s_count integer; a_count integer;
BEGIN
 IF NOT (SELECT sealed FROM "public"."project_plan_versions" WHERE id=NEW.id) THEN RAISE EXCEPTION 'Unsealed publication' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO s_count FROM "public"."project_plan_stages" WHERE plan_id=NEW.id;
 SELECT count(*) INTO a_count FROM "public"."project_plan_activities" WHERE plan_id=NEW.id;
 IF s_count NOT BETWEEN 1 AND 25 OR a_count NOT BETWEEN 1 AND 200 OR EXISTS(SELECT 1 FROM "public"."project_plan_stages" s WHERE s.plan_id=NEW.id AND NOT EXISTS(SELECT 1 FROM "public"."project_plan_activities" a WHERE a.stage_id=s.id)) OR (SELECT max(position) FROM "public"."project_plan_stages" WHERE plan_id=NEW.id)<>s_count OR EXISTS(SELECT 1 FROM "public"."project_plan_activities" WHERE plan_id=NEW.id GROUP BY stage_id HAVING max(position)<>count(*)) THEN RAISE EXCEPTION 'Invalid published plan' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER project_plan_publication_check AFTER INSERT ON "public"."project_plan_versions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."check_project_plan_publication"();
ALTER TABLE "public"."project_workflow_updates" ADD CONSTRAINT project_update_identity UNIQUE(id,project_id);
ALTER TABLE "public"."project_workflow_updates" ADD CONSTRAINT project_update_correction_scope FOREIGN KEY(correction_of,project_id) REFERENCES "public"."project_workflow_updates"(id,project_id) ON DELETE RESTRICT;
