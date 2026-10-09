-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "conversation_held_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"text" text NOT NULL,
	"raw_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE INDEX IF NOT EXISTS "conversation_held_turns_conversation_idx" ON "conversation_held_turns" USING btree ("conversation_id","created_at");
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "conversation_held_turns" ADD CONSTRAINT "conversation_held_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
