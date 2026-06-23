CREATE TABLE IF NOT EXISTS "sonata_songs_ext_ultimate_guitar" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"tab_id" text NOT NULL,
	"song_name" text NOT NULL,
	"artist_name" text NOT NULL,
	"type" text NOT NULL,
	"key" text,
	"capo" integer NOT NULL,
	"tuning" text NOT NULL,
	"content" text NOT NULL,
	"url_web" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_ultimate_guitar" ADD CONSTRAINT "sonata_songs_ext_ultimate_guitar_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
