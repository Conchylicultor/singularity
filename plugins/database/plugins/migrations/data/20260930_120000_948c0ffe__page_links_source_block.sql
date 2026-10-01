-- Custom SQL migration file, put your code below! --
-- migration: 20260930_120000__page_links_source_block --

-- `page_links` gains `source_block_id` (the content block that carried the
-- link — what a backlink's snippet is read from), and it joins the primary key
-- (source_page_id, target_page_id, source_block_id).
--
-- The rows already in the table predate the column and name no block, and a
-- block cannot be recovered from an edge. The table is a DERIVED index — every
-- row is rebuilt from the source page's blocks by `reindexPage` — so the old
-- rows are dropped here, between the schema migration's expand (the column
-- exists, nullable) and its contract (`SET NOT NULL`, the new primary key), and
-- the `page.links.backfill` boot warm-up reindexes every page to rebuild them.
--
-- IDEMPOTENT: a second run finds no NULL block ids.
DELETE FROM page_links WHERE source_block_id IS NULL;
