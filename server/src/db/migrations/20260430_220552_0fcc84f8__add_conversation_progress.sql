CREATE TABLE IF NOT EXISTS "conversation_progress" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"phase" text NOT NULL,
	"message_id" text,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_progress" ADD CONSTRAINT "conversation_progress_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
