CREATE TABLE IF NOT EXISTS "traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worktree" text NOT NULL,
	"trigger_kind" text NOT NULL,
	"trigger_label" text NOT NULL,
	"duration_ms" double precision NOT NULL,
	"threshold_ms" double precision NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_created_at_idx" ON "traces" USING btree ("created_at");