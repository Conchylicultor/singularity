CREATE TABLE IF NOT EXISTS "sonata_songs_ext_midi" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"attachment_id" text NOT NULL,
	"track_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_midi" ADD CONSTRAINT "sonata_songs_ext_midi_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "sonata_songs" DROP COLUMN IF EXISTS "midi_attachment_id";--> statement-breakpoint
ALTER TABLE "sonata_songs" DROP COLUMN IF EXISTS "midi_track_count";