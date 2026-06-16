CREATE TABLE IF NOT EXISTS "entity_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"label" text,
	"author" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_versions_source_entity_created_idx" ON "entity_versions" USING btree ("source_id","entity_id","created_at");