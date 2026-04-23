CREATE TABLE IF NOT EXISTS "events_test_pinged_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_name" text NOT NULL,
	"action_config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_test_pinged_triggers_userId_idx" ON "events_test_pinged_triggers" USING btree ("user_id") WHERE enabled;