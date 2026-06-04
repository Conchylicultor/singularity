CREATE TABLE IF NOT EXISTS "page_blocks_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_blocks_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks_attachments" ADD CONSTRAINT "page_blocks_attachments_owner_id_page_blocks_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks_attachments" ADD CONSTRAINT "page_blocks_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
