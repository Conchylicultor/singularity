CREATE TABLE IF NOT EXISTS "page_blocks_ext_story" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"default_renderer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_story" ADD CONSTRAINT "page_blocks_ext_story_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
