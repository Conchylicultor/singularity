-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "tasks_ext_outcome_report" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"body" text NOT NULL,
	"standing" text NOT NULL,
	"question" text,
	"answers" jsonb NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "tasks_ext_auto_start" ADD COLUMN "auto_start_prompt" text;
ALTER TABLE "tasks_ext_origin" ADD COLUMN "role" text DEFAULT 'filed' NOT NULL;
ALTER TABLE "tasks_ext_origin" ADD COLUMN "released_at" timestamp with time zone;
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "tasks_ext_outcome_report" ADD CONSTRAINT "tasks_ext_outcome_report_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
