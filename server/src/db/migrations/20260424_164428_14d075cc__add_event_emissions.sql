CREATE TABLE IF NOT EXISTS "event_emissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"matched_count" integer NOT NULL,
	"matched_trigger_ids" jsonb NOT NULL,
	"emitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_emissions_emitted_at_idx" ON "event_emissions" USING btree ("emitted_at");