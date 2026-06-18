ALTER TABLE "conversations" ADD COLUMN "hibernated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_viewed_at" timestamp with time zone;