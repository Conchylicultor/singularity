CREATE TABLE IF NOT EXISTS "chord_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"token" text NOT NULL,
	"answer" text NOT NULL,
	"correct" boolean NOT NULL,
	"answer_ms" integer NOT NULL,
	"answered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chord_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" text NOT NULL,
	"video_id" text NOT NULL,
	"shape" text NOT NULL,
	"start_beat" double precision NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"box_count" integer NOT NULL,
	"correct_count" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chord_answers" ADD CONSTRAINT "chord_answers_round_id_chord_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."chord_rounds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chord_answers_token_answered_at_idx" ON "chord_answers" USING btree ("token","answered_at" DESC NULLS LAST,"position" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chord_answers_answered_at_idx" ON "chord_answers" USING btree ("answered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chord_answers_round_id_idx" ON "chord_answers" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chord_rounds_checked_at_idx" ON "chord_rounds" USING btree ("checked_at");