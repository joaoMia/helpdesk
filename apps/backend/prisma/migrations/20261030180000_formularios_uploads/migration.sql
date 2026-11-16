-- Private staging before a ticket exists. No existing row or constraint is changed.
CREATE TABLE "opening_uploads" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(),
 "owner_id" UUID NOT NULL,
 "service_id" UUID NOT NULL,
 "form_version_id" UUID NOT NULL,
 "field_id" UUID NOT NULL,
 "field_key" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "mime" TEXT NOT NULL,
 "size" INTEGER NOT NULL,
 "sha256" VARCHAR(64) NOT NULL,
 "storage_key" TEXT NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expires_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "opening_uploads_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "opening_uploads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "opening_uploads_service_id_form_version_id_fkey" FOREIGN KEY ("service_id","form_version_id") REFERENCES "service_form_versions"("service_id","id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "opening_uploads_form_version_id_field_id_field_key_fkey" FOREIGN KEY ("form_version_id","field_id","field_key") REFERENCES "service_form_fields"("form_version_id","id","key") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "opening_upload_shape" CHECK (size>0 AND size<=10485760 AND mime IN ('image/png','text/plain') AND sha256 ~ '^[a-f0-9]{64}$' AND storage_key ~ '^[a-f0-9-]{36}\.bin$' AND expires_at>created_at)
);
CREATE UNIQUE INDEX "opening_uploads_storage_key_key" ON "opening_uploads"("storage_key");
CREATE INDEX "opening_uploads_owner_id_expires_at_idx" ON "opening_uploads"("owner_id","expires_at");
