CREATE TABLE IF NOT EXISTS "active_data_bindings" (
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"tag" text NOT NULL,
	"occurrence_index" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "active_data_bindings_conversation_id_message_id_tag_occurrence_index_pk" PRIMARY KEY("conversation_id","message_id","tag","occurrence_index")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "active_data_bindings" ADD CONSTRAINT "active_data_bindings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
