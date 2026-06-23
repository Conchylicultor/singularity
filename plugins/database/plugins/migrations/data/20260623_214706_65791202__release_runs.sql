CREATE TABLE IF NOT EXISTS "release_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"composition" text NOT NULL,
	"target" text NOT NULL,
	"namespace" text DEFAULT 'singularity' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"exit_code" integer,
	"platform" text,
	"artifact_path" text,
	"port" integer,
	"error" text,
	"pid" integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_runs_inflight_uniq" ON "release_runs" USING btree ("namespace","composition") WHERE "release_runs"."finished_at" IS NULL;