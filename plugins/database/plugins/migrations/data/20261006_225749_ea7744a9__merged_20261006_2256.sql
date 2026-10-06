-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "pending_questions" (
	"tool_use_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"questions" jsonb NOT NULL,
	"relay_pid" integer NOT NULL,
	"state" text NOT NULL,
	"answer" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "pending_questions_conversation_idx" ON "pending_questions" USING btree ("conversation_id","created_at");
CREATE INDEX IF NOT EXISTS "pending_questions_resolved_at_idx" ON "pending_questions" USING btree ("resolved_at");
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "pending_questions" ADD CONSTRAINT "pending_questions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
