CREATE TABLE IF NOT EXISTS "conversations_ext_preprompt" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"preprompt_id" text NOT NULL,
	"title" text NOT NULL,
	"prompt_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations_ext_preprompt" ADD CONSTRAINT "conversations_ext_preprompt_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
