-- Unify page_documents into page_blocks (a page is a block of type "page").
-- Hand-corrected ordering: drizzle-kit emitted DROP TABLE ... CASCADE before the
-- explicit DROP CONSTRAINT of the cascaded FKs (Postgres 42704), and added the
-- page_links PK before its columns existed. Rewritten to drop FKs first, then the
-- table, then reshape columns before re-adding the PK. Rows were already cleared
-- by the preceding wipe_page_data migration, so the NOT NULL adds are safe.
ALTER TABLE "page_blocks" DROP CONSTRAINT IF EXISTS "page_blocks_document_id_page_documents_id_fk";--> statement-breakpoint
ALTER TABLE "page_links" DROP CONSTRAINT IF EXISTS "page_links_source_document_id_page_documents_id_fk";--> statement-breakpoint
ALTER TABLE "page_links" DROP CONSTRAINT IF EXISTS "page_links_target_document_id_page_documents_id_fk";--> statement-breakpoint
ALTER TABLE "page_links" DROP CONSTRAINT IF EXISTS "page_links_source_document_id_target_document_id_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "page_blocks_doc_parent_rank_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "page_blocks_document_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "page_blocksChanged_triggers_documentId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "page_links_target_idx";--> statement-breakpoint
ALTER TABLE "page_documents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "page_documents" CASCADE;--> statement-breakpoint
ALTER TABLE "page_blocks" DROP COLUMN IF EXISTS "document_id";--> statement-breakpoint
ALTER TABLE "page_blocks" ADD COLUMN "page_id" text;--> statement-breakpoint
ALTER TABLE "page_links" DROP COLUMN IF EXISTS "source_document_id";--> statement-breakpoint
ALTER TABLE "page_links" DROP COLUMN IF EXISTS "target_document_id";--> statement-breakpoint
ALTER TABLE "page_links" ADD COLUMN "source_page_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "page_links" ADD COLUMN "target_page_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_source_page_id_target_page_id_pk" PRIMARY KEY("source_page_id","target_page_id");--> statement-breakpoint
ALTER TABLE "page_blocksChanged_triggers" DROP COLUMN IF EXISTS "document_id";--> statement-breakpoint
ALTER TABLE "page_blocksChanged_triggers" ADD COLUMN "page_id" text;--> statement-breakpoint
ALTER TABLE "page_blocks" ADD CONSTRAINT "page_blocks_page_id_page_blocks_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_source_page_id_page_blocks_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_target_page_id_page_blocks_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocks_page_parent_rank_idx" ON "page_blocks" USING btree ("page_id","parent_id","rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocks_page_id_idx" ON "page_blocks" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocksChanged_triggers_pageId_idx" ON "page_blocksChanged_triggers" USING btree ("page_id") WHERE enabled;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_links_target_idx" ON "page_links" USING btree ("target_page_id");
