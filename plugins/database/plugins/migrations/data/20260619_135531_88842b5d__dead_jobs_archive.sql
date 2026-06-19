CREATE TABLE IF NOT EXISTS "dead_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"input" jsonb,
	"attempts" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"last_error" text,
	"died_at" timestamp with time zone,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dead_jobs_archived_at_idx" ON "dead_jobs" USING btree ("archived_at");