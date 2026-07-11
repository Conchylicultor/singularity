CREATE TABLE IF NOT EXISTS "trash_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"root_entity_id" text NOT NULL,
	"label" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trash_entries_source_deleted_idx" ON "trash_entries" USING btree ("source_id","deleted_at");