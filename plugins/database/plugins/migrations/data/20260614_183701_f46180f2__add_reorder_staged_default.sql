CREATE TABLE IF NOT EXISTS "reorder_staged_default" (
	"slot_id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"items" jsonb NOT NULL,
	"author_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
