CREATE TABLE IF NOT EXISTS "conversation_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"category_id" text NOT NULL,
	"item" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_categories" ADD CONSTRAINT "conversation_categories_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_categories_conversation_idx" ON "conversation_categories" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_categories_conv_cat_idx" ON "conversation_categories" USING btree ("conversation_id","category_id");