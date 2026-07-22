DROP INDEX IF EXISTS "build_runs_inflight_uniq";--> statement-breakpoint
ALTER TABLE "build_runs" ADD COLUMN "target" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "build_runs" ADD COLUMN "parent_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "build_runs_inflight_uniq" ON "build_runs" USING btree ("namespace","target") WHERE "build_runs"."finished_at" IS NULL;