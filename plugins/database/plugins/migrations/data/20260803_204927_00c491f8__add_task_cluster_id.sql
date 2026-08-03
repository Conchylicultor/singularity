ALTER TABLE "tasks" ADD COLUMN "cluster_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_cluster_id_idx" ON "tasks" USING btree ("cluster_id");