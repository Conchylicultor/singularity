CREATE TABLE IF NOT EXISTS "job_recent_runs" (
	"job_name" text NOT NULL,
	"slot" integer NOT NULL,
	"seq" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"duration_ms" integer NOT NULL,
	"attempt" integer NOT NULL,
	CONSTRAINT "job_recent_runs_job_name_slot_pk" PRIMARY KEY("job_name","slot")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_run_stats" (
	"job_name" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone NOT NULL,
	"last_finished_at" timestamp with time zone NOT NULL,
	"last_outcome" text NOT NULL,
	"last_error" text,
	"last_duration_ms" integer NOT NULL,
	"last_success_at" timestamp with time zone,
	"runs" integer NOT NULL,
	"failures" integer NOT NULL
);
