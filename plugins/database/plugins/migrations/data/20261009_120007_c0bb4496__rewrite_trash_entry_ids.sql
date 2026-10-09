-- Custom SQL migration file, put your code below! --
-- migration: 20261009_120007__rewrite_trash_entry_ids --

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

-- Soft ref (no FK): a soft-deleted page block names the trash entry that
-- holds it. Pattern-matched, so the order against the entries below does not
-- matter.
UPDATE page_blocks SET trash_entry_id = 'trash-' || trash_entry_id
  WHERE trash_entry_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE trash_entries SET id = 'trash-' || id WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
