CREATE TABLE IF NOT EXISTS "sonata_songs_ext_playback" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sonata_songs" ADD COLUMN "midi_track_count" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_playback" ADD CONSTRAINT "sonata_songs_ext_playback_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
