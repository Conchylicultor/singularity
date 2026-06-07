CREATE TABLE IF NOT EXISTS "sonata_songs_ext_chord_grid" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"chord_text" text NOT NULL,
	"voicing_id" text NOT NULL,
	"octave" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_chord_grid" ADD CONSTRAINT "sonata_songs_ext_chord_grid_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
