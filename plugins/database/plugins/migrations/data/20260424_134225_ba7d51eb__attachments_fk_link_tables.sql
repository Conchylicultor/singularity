CREATE TABLE IF NOT EXISTS "tasks_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "attachments_owner_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "attachments_staged_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_attachments" ADD CONSTRAINT "tasks_attachments_owner_id_tasks_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks_attachments" ADD CONSTRAINT "tasks_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Fail loudly on any owner_type we didn't expect, so the data copy below
-- doesn't silently orphan attachments of a type we didn't migrate.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "attachments"
    WHERE "owner_type" IS NOT NULL AND "owner_type" <> 'task'
  ) THEN
    RAISE EXCEPTION 'attachments has unexpected owner_type values; aborting migration';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO "tasks_attachments" ("owner_id", "attachment_id", "created_at")
  SELECT "owner_id", "id", "created_at" FROM "attachments"
  WHERE "owner_type" = 'task' AND "owner_id" IS NOT NULL
  ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN IF EXISTS "owner_type";--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN IF EXISTS "owner_id";