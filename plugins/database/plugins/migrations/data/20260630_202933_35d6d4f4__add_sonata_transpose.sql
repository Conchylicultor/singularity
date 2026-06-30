CREATE TABLE IF NOT EXISTS "sonata_songs_ext_transpose" (
	"parent_id" text PRIMARY KEY NOT NULL,
	"semitones" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_transpose" ADD CONSTRAINT "sonata_songs_ext_transpose_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
