ALTER TABLE "page_documents" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "page_documents" ADD COLUMN "rank" "rank_text" NOT NULL;--> statement-breakpoint
ALTER TABLE "page_documents" ADD COLUMN "expanded" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "page_documents" ADD COLUMN "icon" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_documents" ADD CONSTRAINT "page_documents_parent_id_page_documents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_documents_parent_rank_idx" ON "page_documents" USING btree ("parent_id","rank");