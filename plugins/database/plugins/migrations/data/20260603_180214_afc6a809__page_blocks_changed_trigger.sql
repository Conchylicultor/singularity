CREATE TABLE IF NOT EXISTS "page_blocksChanged_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_with" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_blocksChanged_triggers_documentId_idx" ON "page_blocksChanged_triggers" USING btree ("document_id") WHERE enabled;