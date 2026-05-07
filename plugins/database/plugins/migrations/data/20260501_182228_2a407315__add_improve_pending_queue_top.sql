CREATE TABLE IF NOT EXISTS "improve_pending_queue_top" (
	"task_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
