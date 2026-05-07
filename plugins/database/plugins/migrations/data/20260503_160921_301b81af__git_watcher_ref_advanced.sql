CREATE TABLE IF NOT EXISTS "git_refAdvanced_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ref_name" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "git_refAdvanced_triggers_refName_idx" ON "git_refAdvanced_triggers" USING btree ("ref_name") WHERE enabled;