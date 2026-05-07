ALTER TABLE "pushes" ADD COLUMN "push_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pushes_sha_unique" ON "pushes" USING btree ("sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pushes_push_id_idx" ON "pushes" USING btree ("push_id");