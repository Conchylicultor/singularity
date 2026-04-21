CREATE TABLE IF NOT EXISTS "crashes" (
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"worktree" text NOT NULL,
	"source" text NOT NULL,
	"error_type" text,
	"message" text NOT NULL,
	"stack" text,
	"component_stack" text,
	"url" text,
	"user_agent" text,
	"slot" text,
	"label" text,
	"count" integer DEFAULT 1 NOT NULL,
	"crash_loop" boolean DEFAULT false NOT NULL,
	"task_id" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crashes_fingerprint_worktree_idx" ON "crashes" USING btree ("fingerprint","worktree");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crashes_task_id_idx" ON "crashes" USING btree ("task_id");