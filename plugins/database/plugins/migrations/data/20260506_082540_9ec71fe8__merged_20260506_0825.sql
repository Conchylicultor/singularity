CREATE TABLE IF NOT EXISTS "conversation_userTurnSent_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_userTurnSent_triggers_conversationId_idx" ON "conversation_userTurnSent_triggers" USING btree ("conversation_id") WHERE enabled;