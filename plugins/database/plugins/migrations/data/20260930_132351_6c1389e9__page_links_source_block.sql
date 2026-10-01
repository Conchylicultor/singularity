-- singularity:phase expand
ALTER TABLE "page_links" DROP CONSTRAINT "page_links_source_page_id_target_page_id_pk";
ALTER TABLE "page_links" ADD COLUMN "source_block_id" text;
-- singularity:phase contract
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_source_page_id_target_page_id_source_block_id_pk" PRIMARY KEY("source_page_id","target_page_id","source_block_id");
ALTER TABLE "page_links" ALTER COLUMN "source_block_id" SET NOT NULL;
DO $$ BEGIN
 ALTER TABLE "page_links" ADD CONSTRAINT "page_links_source_block_id_page_blocks_id_fk" FOREIGN KEY ("source_block_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
-- 20260930_120000__page_links_source_block
