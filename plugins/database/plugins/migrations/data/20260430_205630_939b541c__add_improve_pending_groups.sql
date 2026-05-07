CREATE TABLE IF NOT EXISTS "improve_pending_groups" (
	"task_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
