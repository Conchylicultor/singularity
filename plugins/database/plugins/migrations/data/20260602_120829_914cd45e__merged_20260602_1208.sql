ALTER TABLE "notifications" ADD COLUMN "dedup_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_key_idx" ON "notifications" USING btree ("dedup_key");