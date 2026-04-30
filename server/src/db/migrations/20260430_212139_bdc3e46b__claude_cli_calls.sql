CREATE TABLE IF NOT EXISTS "claude_cli_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	"source_name" text NOT NULL,
	"source_context" jsonb,
	"prompt" text NOT NULL,
	"system" text,
	"output" text,
	"error" text,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claude_cli_calls_created_at_idx" ON "claude_cli_calls" USING btree ("created_at");