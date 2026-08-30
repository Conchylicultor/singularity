CREATE INDEX IF NOT EXISTS "deploy_runs_started_id_idx" ON "deploy_runs" USING btree ("started_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_runs_started_id_idx" ON "backup_runs" USING btree ("started_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_runs_ns_started_id_idx" ON "build_runs" USING btree ("namespace","started_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_runs_ns_started_id_idx" ON "release_runs" USING btree ("namespace","started_at" DESC NULLS LAST,"id");