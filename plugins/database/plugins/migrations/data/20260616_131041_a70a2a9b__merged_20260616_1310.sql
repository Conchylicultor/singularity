CREATE TABLE IF NOT EXISTS "page_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"block_id" text NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_reminders" ADD CONSTRAINT "page_reminders_page_id_page_blocks_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_reminders" ADD CONSTRAINT "page_reminders_block_id_page_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_reminders_page_idx" ON "page_reminders" USING btree ("page_id");