CREATE TABLE IF NOT EXISTS "stats_commits_excluded_path_state" (
	"path" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
