CREATE TABLE IF NOT EXISTS "conversation_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	"turn_count_at_generation" integer NOT NULL,
	"phase" text NOT NULL,
	"phase_detail" text,
	"flags" text,
	"next_action" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_summaries_by_conv_idx" ON "conversation_summaries" USING btree ("conversation_id","generated_at");