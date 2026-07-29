-- Custom SQL migration file, put your code below! --
-- migration: 20260729_124840__callout_anchor_split --

-- Callout as a void container anchor
-- (research/2026-07-29-page-callout-void-container.md).
--
-- A `callout` row no longer carries `text`: it is now a VOID container whose
-- content is its children, and its former line becomes an ordinary `text` child.
-- Each existing callout R is split into a fresh anchor A (icon + colour) plus R
-- itself, retyped to `text` and reparented under A.
--
-- R KEEPS ITS ID deliberately. Its `page_block_docs` Yjs doc — the authoritative
-- text, of which `data.text` is only the ~1s projection — is keyed by block id,
-- so keeping the id keeps the content, its formatting and its edit history. The
-- fresh id goes to the anchor, which is void and never opens a content doc.
-- R's own children stay under R, which preserves their pre-migration indentation
-- exactly (they already rendered one indent right of the callout line, inside
-- the tint).
--
-- THE RANK DANCE. `page_blocks_parent_rank_live_uq` is a NON-DEFERRABLE partial
-- unique index on (parent_id, rank), so A cannot be inserted holding the rank it
-- is displacing, even transiently within a statement. A is therefore parked at
-- `R.rank || '0'`, which is provably collision-free: `fractional-indexing`'s
-- validateOrderKey rejects any key whose FRACTIONAL part ends in '0', and
-- appending a character never changes the integer part (its length is fixed by
-- the head character). The parked value is thus not a valid order key at all, so
-- it cannot equal any minted rank — under any parent, at root, or between two
-- callouts migrating at once. The real rank rides along in `data._migrationRank`
-- and statement 3 puts it back.
--
-- IDEMPOTENT. Statements 1-2 are guarded on `data ? 'text'` and statement 3 on
-- `data ? '_migrationRank'`; after one run no row satisfies either, so a re-run
-- is a no-op. (Guarding statement 3 on the rank's shape would NOT be idempotent:
-- 'a0' is both a legitimate rank and one that ends in '0'.)

-- (`expanded` below is `page_blocks.expanded`, which is alive and well — the
-- concurrent `drop_expanded_column` migration only drops it from `agents` and
-- `tasks`.)

-- 1. Mint the anchor beside each callout, parked one character past its rank.
--    deleted_at / trash_entry_id are copied so a trashed callout's anchor is not
--    resurrected as a live row.
INSERT INTO page_blocks (id, page_id, parent_id, type, data, rank, expanded, deleted_at, trash_entry_id)
SELECT
  'ca-' || r.id,
  r.page_id,
  r.parent_id,
  'callout',
  jsonb_build_object(
    'icon',            COALESCE(r.data -> 'icon', 'null'::jsonb),
    'iconSvgNodes',    COALESCE(r.data -> 'iconSvgNodes', 'null'::jsonb),
    'color',           COALESCE(r.data -> 'color', '"default"'::jsonb),
    '_migrationRank',  to_jsonb(r.rank)
  ),
  r.rank || '0',
  true,
  r.deleted_at,
  r.trash_entry_id
FROM page_blocks r
WHERE r.type = 'callout' AND r.data ? 'text';

-- 2. Demote the original row to the callout's first line, under its anchor.
UPDATE page_blocks r
SET parent_id = 'ca-' || r.id,
    rank      = 'a0',
    type      = 'text',
    data      = jsonb_build_object('text', COALESCE(r.data -> 'text', '[]'::jsonb))
WHERE r.type = 'callout' AND r.data ? 'text';

-- 3. The slot is free now: move each anchor into it and drop the scratch key.
UPDATE page_blocks a
SET rank = a.data ->> '_migrationRank',
    data = a.data - '_migrationRank'
WHERE a.data ? '_migrationRank';

-- 4. Version-history snapshots embed pre-migration callout blocks verbatim
--    (`entity_versions.snapshot` is {page, blocks: StoredBlock[]}, a flat array).
--    Restoring one would replay `data.text` through parseBlockData's strict
--    schema and 400. Retype those entries to plain `text` so old versions stay
--    restorable; their icon and tint are lost, which is confined to already
--    superseded versions and is loud-free.
UPDATE entity_versions v
SET snapshot = jsonb_set(
  v.snapshot,
  '{blocks}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN b ->> 'type' = 'callout'
          THEN jsonb_set(b, '{type}', '"text"')
               || jsonb_build_object('data', jsonb_build_object(
                    'text', COALESCE(b -> 'data' -> 'text', '[]'::jsonb)))
        ELSE b
      END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(v.snapshot -> 'blocks') WITH ORDINALITY AS t(b, ord)
  )
)
WHERE v.source_id = 'pages'
  AND v.snapshot -> 'blocks' @> '[{"type": "callout"}]';
