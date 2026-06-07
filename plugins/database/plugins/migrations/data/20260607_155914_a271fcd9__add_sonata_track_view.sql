CREATE TABLE IF NOT EXISTS "sonata_track_view" (
	"song_id" text NOT NULL,
	"track_id" text NOT NULL,
	"color" text,
	"muted" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sonata_track_view_song_id_track_id_pk" PRIMARY KEY("song_id","track_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_track_view" ADD CONSTRAINT "sonata_track_view_song_id_sonata_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
