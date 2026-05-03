CREATE TABLE IF NOT EXISTS "conversations_ext_progress" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"phase" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "conversation_progress" CASCADE;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations_ext_progress" ADD CONSTRAINT "conversations_ext_progress_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
