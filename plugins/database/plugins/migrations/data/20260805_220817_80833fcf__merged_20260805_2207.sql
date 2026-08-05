CREATE TABLE IF NOT EXISTS "page_blocks_agent_authors" (
	"block_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_blocks_agent_authors_block_id_conversation_id_pk" PRIMARY KEY("block_id","conversation_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_blocks_agent_authors" ADD CONSTRAINT "page_blocks_agent_authors_block_id_page_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
