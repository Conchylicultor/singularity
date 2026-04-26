CREATE TABLE IF NOT EXISTS "job_steps" (
	"workflow_run_id" text NOT NULL,
	"step_name" text NOT NULL,
	"result_json" jsonb,
	"error_message" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_steps_workflow_run_id_step_name_pk" PRIMARY KEY("workflow_run_id","step_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_waits" (
	"workflow_run_id" text NOT NULL,
	"wait_name" text NOT NULL,
	"status" text NOT NULL,
	"payload_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "job_waits_workflow_run_id_wait_name_pk" PRIMARY KEY("workflow_run_id","wait_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_turn-completed_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_waits_status_idx" ON "job_waits" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_turn-completed_triggers_conversationId_idx" ON "conversation_turn-completed_triggers" USING btree ("conversation_id") WHERE enabled;