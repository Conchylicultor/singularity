ALTER TABLE "event_source_runs" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_sources" ADD COLUMN "last_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "date" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "series_key";