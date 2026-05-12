CREATE TABLE IF NOT EXISTS "queue_state" (
	"id" text PRIMARY KEY NOT NULL,
	"pinned_conversation_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
