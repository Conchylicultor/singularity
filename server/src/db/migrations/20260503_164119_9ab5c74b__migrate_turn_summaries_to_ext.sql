CREATE TABLE IF NOT EXISTS "conversations_ext_turn_summary" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"summary" text NOT NULL,
	"caveats" text DEFAULT '' NOT NULL,
	"actions" text DEFAULT '' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "turn_summaries" CASCADE;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations_ext_turn_summary" ADD CONSTRAINT "conversations_ext_turn_summary_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
