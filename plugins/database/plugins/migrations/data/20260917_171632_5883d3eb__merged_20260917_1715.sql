CREATE TABLE IF NOT EXISTS "page_instructions_deliveries" (
	"conversation_id" text NOT NULL,
	"block_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_instructions_deliveries_conversation_id_block_id_pk" PRIMARY KEY("conversation_id","block_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_instructions_deliveries" ADD CONSTRAINT "page_instructions_deliveries_block_id_page_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
