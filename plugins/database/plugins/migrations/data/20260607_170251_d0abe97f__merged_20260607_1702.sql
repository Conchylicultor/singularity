ALTER TABLE "crashes" ADD COLUMN "noise" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "muted" boolean DEFAULT false NOT NULL;