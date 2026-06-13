ALTER TABLE "crashes" RENAME TO "reports";--> statement-breakpoint
DROP INDEX IF EXISTS "crashes_fingerprint_worktree_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "crashes_task_id_idx";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "kind" text DEFAULT 'crash' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_fingerprint_worktree_idx" ON "reports" USING btree ("fingerprint","worktree");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_task_id_idx" ON "reports" USING btree ("task_id");