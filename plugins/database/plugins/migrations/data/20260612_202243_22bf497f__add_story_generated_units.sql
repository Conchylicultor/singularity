CREATE TABLE IF NOT EXISTS "story_generated_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" text NOT NULL,
	"kind" text NOT NULL,
	"unit_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"output" text,
	"prompt" text,
	"instruction" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "story_generated_units_pk_idx" ON "story_generated_units" USING btree ("page_id","kind","unit_id");