-- singularity:phase expand
CREATE TABLE IF NOT EXISTS "page_blocks_ext_tags" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"tag_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "page_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_tags" ADD CONSTRAINT "page_blocks_ext_tags_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "page_tags_name_key_idx" ON "page_tags" USING btree ("name_key");
-- singularity:claims
-- 20261009_125452__page_tags_from_title_prefix
