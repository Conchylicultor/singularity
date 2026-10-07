-- singularity:phase expand
ALTER TABLE "sonata_songs_ext_ug_alignment" ADD COLUMN "pick" text DEFAULT 'user' NOT NULL;
ALTER TABLE "sonata_songs_ext_ug_alignment" ADD COLUMN "candidates" jsonb DEFAULT '[]'::jsonb NOT NULL;
CREATE INDEX IF NOT EXISTS "chord_sections_artist_song_slug" ON "chord_sections" USING btree ("artist_slug","song_slug");
-- singularity:phase contract
-- singularity:claims
