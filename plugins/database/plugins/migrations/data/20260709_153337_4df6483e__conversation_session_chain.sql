CREATE TABLE IF NOT EXISTS "conversation_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"claude_session_id" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_sessions_by_conv_idx" ON "conversation_sessions" USING btree ("conversation_id","seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_sessions_conv_session_idx" ON "conversation_sessions" USING btree ("conversation_id","claude_session_id");