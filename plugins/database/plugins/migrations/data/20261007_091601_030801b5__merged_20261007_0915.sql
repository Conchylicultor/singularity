-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "tasks_ext_origin" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"source_keys" jsonb NOT NULL,
	"filed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tasks_ext_origin_automation_filed_idx" ON "tasks_ext_origin" USING btree ("automation_id","filed_at");
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "tasks_ext_origin" ADD CONSTRAINT "tasks_ext_origin_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
