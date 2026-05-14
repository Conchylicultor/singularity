CREATE TABLE IF NOT EXISTS "backup_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"archive_size_bytes" integer,
	"manifest" jsonb,
	"target_results" jsonb
);
