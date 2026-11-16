-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'RESOLVED';
-- statement-breakpoint
BEGIN;
-- statement-breakpoint

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "resolved_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_solutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "comment_id" UUID,
    "solution_id" UUID,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_comments_ticket_id_created_at_idx" ON "ticket_comments"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_comments_ticket_id_id_key" ON "ticket_comments"("ticket_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_solutions_ticket_id_key" ON "ticket_solutions"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_solutions_ticket_id_id_key" ON "ticket_solutions"("ticket_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_attachments_storage_key_key" ON "ticket_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticket_id_created_at_idx" ON "ticket_attachments"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_solutions" ADD CONSTRAINT "ticket_solutions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_solutions" ADD CONSTRAINT "ticket_solutions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_comment_id_fkey" FOREIGN KEY ("ticket_id", "comment_id") REFERENCES "ticket_comments"("ticket_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_solution_id_fkey" FOREIGN KEY ("ticket_id", "solution_id") REFERENCES "ticket_solutions"("ticket_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT resolved_state_integrity CHECK (
 (status::text<>'RESOLVED' OR (assigned_technician_id IS NOT NULL AND priority IS NOT NULL AND first_started_at IS NOT NULL AND resolved_at>=first_started_at AND resolved_at IS NOT NULL AND closed_at IS NULL))
 AND (resolved_at IS NULL OR status::text IN ('RESOLVED','CLOSED'))
);
ALTER TABLE "ticket_comments" ADD CONSTRAINT comment_content_valid CHECK (length(btrim(content)) BETWEEN 1 AND 4000);
ALTER TABLE "ticket_solutions" ADD CONSTRAINT solution_content_valid CHECK (length(btrim(description)) BETWEEN 1 AND 4000);
ALTER TABLE "ticket_attachments" ADD CONSTRAINT attachment_shape CHECK (size>0 AND size<=20971520 AND mime IN ('image/png','text/plain') AND sha256 ~ '^[a-f0-9]{64}$' AND storage_key ~ '^[a-f0-9-]{36}\.bin$' AND NOT(comment_id IS NOT NULL AND solution_id IS NOT NULL));
-- statement-breakpoint
CREATE FUNCTION "public"."immutable_conversation_record"() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Conversation records are immutable'; END;
$$;
-- statement-breakpoint
CREATE TRIGGER immutable_comment BEFORE UPDATE OR DELETE ON "public"."ticket_comments" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
CREATE TRIGGER immutable_solution BEFORE UPDATE OR DELETE ON "public"."ticket_solutions" FOR EACH ROW EXECUTE FUNCTION "public"."immutable_conversation_record"();
-- statement-breakpoint
COMMIT;
