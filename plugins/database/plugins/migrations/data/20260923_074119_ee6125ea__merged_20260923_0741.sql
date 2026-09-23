CREATE TABLE IF NOT EXISTS "chord_curriculum" (
	"id" integer PRIMARY KEY NOT NULL,
	"chords" jsonb NOT NULL,
	"blanks" text NOT NULL,
	"modes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chord_unlocks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "chord_unlocks" CASCADE;--> statement-breakpoint
ALTER TABLE "chord_answers" ADD COLUMN "blanks" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chord_answers_token_blanks_answered_at_idx" ON "chord_answers" USING btree ("token","blanks","answered_at" DESC NULLS LAST,"position" DESC NULLS LAST);