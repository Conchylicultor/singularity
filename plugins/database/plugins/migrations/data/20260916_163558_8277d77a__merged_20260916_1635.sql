CREATE TABLE IF NOT EXISTS "supervised_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"lock_key" text NOT NULL,
	"pid" integer,
	"attempt" integer NOT NULL,
	"workflow_run_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"exit_code" integer,
	"signal_code" text,
	"error_message" text,
	"retryable" boolean
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supervised_job_runs_inflight_uniq" ON "supervised_job_runs" USING btree ("job_name","lock_key") WHERE "supervised_job_runs"."finished_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supervised_job_runs_job_started_idx" ON "supervised_job_runs" USING btree ("job_name","started_at" DESC NULLS LAST);