CREATE TABLE IF NOT EXISTS "page_links" (
	"source_document_id" text NOT NULL,
	"target_document_id" text NOT NULL,
	CONSTRAINT "page_links_source_document_id_target_document_id_pk" PRIMARY KEY("source_document_id","target_document_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_links" ADD CONSTRAINT "page_links_source_document_id_page_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."page_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_links" ADD CONSTRAINT "page_links_target_document_id_page_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."page_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_links_target_idx" ON "page_links" USING btree ("target_document_id");