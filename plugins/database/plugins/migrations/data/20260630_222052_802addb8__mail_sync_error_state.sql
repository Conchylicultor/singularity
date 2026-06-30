ALTER TABLE "mail_sync_state" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "mail_sync_state" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "mail_sync_state" ADD COLUMN "last_error_at" timestamp with time zone;