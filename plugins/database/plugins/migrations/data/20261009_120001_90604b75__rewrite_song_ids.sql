-- Custom SQL migration file, put your code below! --
-- migration: 20261009_120001__rewrite_song_ids --

-- Phase 4 of the unified prefixed ids (`plugins/ids`,
-- research/2026-10-07-global-unified-prefixed-ids.md §4): rows minted as BARE
-- uuids get their kind's prefix — `<uuid>` → `<prefix>-<uuid>`, which the
-- kind's generic recognition body accepts, and which its `legacyBareUuid`
-- `key` / `parse` upgrade an old bare-uuid URL to.
--
-- IDEMPOTENT and FORK-SAFE: every statement touches only values that are still
-- a bare uuid (`~ '^<uuid>$'`), so a re-run, or a worktree fork taken after
-- main applied this, is a no-op — and hand-made ids (`seed-…`) are never
-- touched. Child FK columns follow through ON UPDATE CASCADE (phase 3, already
-- on main); soft refs (no FK) are rewritten explicitly below.

-- Soft ref (no FK): the UG tab-saved trigger subscriptions' `song_id` filter.
UPDATE "sonata_ug_tabSaved_triggers" SET song_id = 'song-' || song_id
  WHERE song_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- The songs. Cascades to every `sonata_songs_ext_*` side-table
-- (`parent_id`), the attachment link (`sonata_songs_attachments.owner_id`)
-- and the track mixer's overrides (`sonata_track_view.song_id`). Bundled
-- starters keep their `seed-…` ids (not a uuid, so not matched).
UPDATE sonata_songs SET id = 'song-' || id WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
