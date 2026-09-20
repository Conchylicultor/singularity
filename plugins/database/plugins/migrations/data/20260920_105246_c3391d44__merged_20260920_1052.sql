CREATE TABLE IF NOT EXISTS "chord_unlocks" (
	"position" integer PRIMARY KEY NOT NULL,
	"step" jsonb NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chord_rounds" ADD COLUMN "given_count" integer DEFAULT 0 NOT NULL;