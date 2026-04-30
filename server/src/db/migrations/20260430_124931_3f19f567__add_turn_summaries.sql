CREATE TABLE IF NOT EXISTS "turn_summaries" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"summary" text NOT NULL,
	"caveats" text DEFAULT '' NOT NULL,
	"actions" text DEFAULT '' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "turn_summaries" ADD CONSTRAINT "turn_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
