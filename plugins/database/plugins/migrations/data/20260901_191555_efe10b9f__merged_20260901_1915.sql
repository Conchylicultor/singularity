ALTER TABLE "deploy_runs" ADD COLUMN "launched_from" text DEFAULT 'singularity' NOT NULL;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD COLUMN "leg_run_id" text;--> statement-breakpoint
ALTER TABLE "deploy_runs" ADD COLUMN "pid" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deploy_runs_server_inflight_uq" ON "deploy_runs" USING btree ("launched_from","server_id") WHERE "deploy_runs"."finished_at" IS NULL;