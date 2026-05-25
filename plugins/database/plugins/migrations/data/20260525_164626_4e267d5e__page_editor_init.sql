CREATE TABLE IF NOT EXISTS "page_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"parent_id" text,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rank" "rank_text" NOT NULL,
	"expanded" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks" ADD CONSTRAINT "page_blocks_document_id_page_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."page_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks" ADD CONSTRAINT "page_blocks_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocks_doc_parent_rank_idx" ON "page_blocks" USING btree ("document_id","parent_id","rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocks_document_id_idx" ON "page_blocks" USING btree ("document_id");