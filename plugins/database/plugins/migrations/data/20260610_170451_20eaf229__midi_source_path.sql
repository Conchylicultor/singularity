ALTER TABLE "sonata_songs_ext_midi" ADD COLUMN "source_path" text;--> statement-breakpoint
ALTER TABLE "sonata_songs_ext_midi" ADD COLUMN "source_missing" boolean DEFAULT false NOT NULL;