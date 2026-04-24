CREATE TABLE IF NOT EXISTS "push_and_exit_jobs" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
