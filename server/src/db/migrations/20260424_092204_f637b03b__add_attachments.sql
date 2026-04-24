CREATE TABLE IF NOT EXISTS "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" text,
	"owner_id" text,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"disk_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_owner_idx" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_staged_idx" ON "attachments" USING btree ("created_at") WHERE "attachments"."owner_id" is null;