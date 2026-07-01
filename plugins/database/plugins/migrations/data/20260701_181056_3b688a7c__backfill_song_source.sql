-- Custom SQL migration file, put your code below! --
-- migration: 20260701_181056__backfill_song_source --

-- Backfill the new `sonata_songs.source` discriminator for rows created before
-- the column existed. A song's source is implied by which source-owned
-- entity-extension side-table holds its row (each song has exactly one). The
-- add-column migration seeded every row with the temporary '' default; these
-- UPDATEs replace it with the real source id. New rows are stamped directly by
-- `createSongRow`, so this migration only touches pre-existing data.
UPDATE "sonata_songs" s
  SET "source" = 'midi'
  FROM "sonata_songs_ext_midi" m
  WHERE m."parent_id" = s."id";

UPDATE "sonata_songs" s
  SET "source" = 'chord-grid'
  FROM "sonata_songs_ext_chord_grid" c
  WHERE c."parent_id" = s."id";

UPDATE "sonata_songs" s
  SET "source" = 'ultimate-guitar'
  FROM "sonata_songs_ext_ultimate_guitar" u
  WHERE u."parent_id" = s."id";
