CREATE TABLE IF NOT EXISTS "tasks_ext_short_title" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"short_title" text NOT NULL,
	"source_title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks_titleChanged_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_ext_short_title" ADD CONSTRAINT "tasks_ext_short_title_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_titleChanged_triggers_taskId_idx" ON "tasks_titleChanged_triggers" USING btree ("task_id") WHERE enabled;