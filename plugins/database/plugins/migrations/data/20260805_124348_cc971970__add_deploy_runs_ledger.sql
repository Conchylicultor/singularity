CREATE TABLE IF NOT EXISTS "deploy_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"server_id" text NOT NULL,
	"composition_id" text NOT NULL,
	"verb" text NOT NULL,
	"release_run_id" text,
	"commit_sha" text,
	"status" text DEFAULT 'running' NOT NULL,
	"phase_failed" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"exit_code" integer,
	"message" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deploy_runs" ADD CONSTRAINT "deploy_runs_deployment_id_deploy_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deploy_deployments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deploy_runs_deployment_started_idx" ON "deploy_runs" USING btree ("deployment_id","started_at" DESC NULLS LAST);