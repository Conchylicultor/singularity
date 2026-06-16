CREATE TABLE IF NOT EXISTS "search_documents" (
	"source" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"route" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title,'')), 'A') || setweight(to_tsvector('english', coalesce(body,'')), 'B')) STORED,
	CONSTRAINT "search_documents_source_entity_id_pk" PRIMARY KEY("source","entity_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_documents_tsv_idx" ON "search_documents" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_documents_source_idx" ON "search_documents" USING btree ("source");