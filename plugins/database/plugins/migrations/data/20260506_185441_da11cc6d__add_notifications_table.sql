CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"variant" text NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"link_to" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_dismissed_idx" ON "notifications" USING btree ("dismissed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");