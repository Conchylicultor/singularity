-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "page_blocks_ext_auto_icon" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"emoji" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_auto_icon" ADD CONSTRAINT "page_blocks_ext_auto_icon_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
-- 20260929_161450__page_icons_to_emoji
