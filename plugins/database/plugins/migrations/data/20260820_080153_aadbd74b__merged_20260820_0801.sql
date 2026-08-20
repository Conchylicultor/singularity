DROP INDEX IF EXISTS "build_runs_inflight_uniq";--> statement-breakpoint
ALTER TABLE "build_runs" ADD COLUMN "targets" text[] DEFAULT '{"singularity"}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "build_runs_inflight_uniq" ON "build_runs" USING btree ("namespace") WHERE "build_runs"."finished_at" IS NULL;--> statement-breakpoint
ALTER TABLE "build_runs" DROP COLUMN IF EXISTS "target";