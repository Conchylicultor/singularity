CREATE TABLE IF NOT EXISTS "trash_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"root_entity_id" text NOT NULL,
	"label" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_blocks" DROP CONSTRAINT "page_blocks_parent_rank_uq";--> statement-breakpoint
ALTER TABLE "page_blocks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "page_blocks" ADD COLUMN "trash_entry_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trash_entries_source_deleted_idx" ON "trash_entries" USING btree ("source_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_blocks_parent_rank_live_uq" ON "page_blocks" USING btree ("parent_id","rank") WHERE deleted_at IS NULL AND parent_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_blocks_root_rank_live_uq" ON "page_blocks" USING btree ("rank") WHERE deleted_at IS NULL AND parent_id IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocks_trash_entry_idx" ON "page_blocks" USING btree ("trash_entry_id");