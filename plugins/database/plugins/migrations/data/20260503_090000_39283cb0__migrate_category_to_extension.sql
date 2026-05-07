CREATE TABLE IF NOT EXISTS "conversations_ext_category" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations_ext_category" ADD CONSTRAINT "conversations_ext_category_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "conversations_ext_category" (parent_id, category, source, created_at, updated_at)
SELECT conversation_id, category, source, classified_at, classified_at
FROM conversation_categories
ON CONFLICT (parent_id) DO NOTHING;
--> statement-breakpoint
DROP TABLE IF EXISTS "conversation_categories";
