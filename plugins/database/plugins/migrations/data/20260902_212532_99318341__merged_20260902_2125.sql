CREATE TABLE IF NOT EXISTS "supervisedRun_ended_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind_id" text,
	"run_id" text
);
--> statement-breakpoint
ALTER TABLE "backup_runs" ADD COLUMN "namespace" text DEFAULT 'singularity' NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD COLUMN "pid" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supervisedRun_ended_triggers_kindId_idx" ON "supervisedRun_ended_triggers" USING btree ("kind_id") WHERE enabled;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supervisedRun_ended_triggers_runId_idx" ON "supervisedRun_ended_triggers" USING btree ("run_id") WHERE enabled;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "backup_runs_inflight_uniq" ON "backup_runs" USING btree ("namespace") WHERE "backup_runs"."finished_at" IS NULL;