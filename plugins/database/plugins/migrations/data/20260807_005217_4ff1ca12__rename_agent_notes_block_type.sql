-- Custom SQL migration file, put your code below! --
-- migration: 20260807_005217__rename_agent_notes_block_type --

-- The annotation family's stored block types go SINGULAR:
--   `agent-notes`   → `agent-note`
--   `private-notes` → `private-note`
--
-- The type IS the markdown tag (`<agent-note id="…">`), and a type names ONE
-- card. Only the type strings move: the plugin directories, packages, exported
-- symbols and the `agent-notes-authors` resource id stay plural — they name a
-- feature area, not an instance. Design:
-- `research/2026-08-07-page-agent-note-file-like-tools.md` §1.
--
-- IDEMPOTENT BY CONSTRUCTION, and that is required. Not for re-runs — the
-- `__singularity_migrations` ledger prevents those — but because every worktree
-- DB is a FORK of main, taken at an unpredictable point relative to this
-- migration. A fork made after main applied it holds only singular rows and must
-- see a no-op; a fork made before holds plural rows and must see the rewrite.
-- The `WHERE type = '<plural>'` predicates give both. Do NOT "simplify" them
-- into an unconditional UPDATE.
--
-- Code and rename ship in ONE push: an unknown block type serializes to an EMPTY
-- LINE, so a renamed row read by old code dissolves and the next write deletes
-- it.

-- 1. The live block rows.
--    Deliberately NOT filtered on `deleted_at`: `page_blocks` soft-deletes, and a
--    trashed card restored later must still resolve to a registered handle.
UPDATE page_blocks SET type = 'agent-note'   WHERE type = 'agent-notes';
UPDATE page_blocks SET type = 'private-note' WHERE type = 'private-notes';

-- 2. Version-history snapshots embed the block rows VERBATIM
--    (`entity_versions.snapshot` is {page, blocks: StoredBlock[]}, a flat array).
--    A restore replays each entry through `parseBlockData`, which 400s on a type
--    no handle is registered for — so skipping this would leave every existing
--    page version holding one of these cards permanently unrestorable, with the
--    failure surfacing months later and pointing nowhere near this rename.
--    Same statement shape as `20260804_140946__quote_anchor_split.sql`, for the
--    same reason.
UPDATE entity_versions v
SET snapshot = jsonb_set(
  v.snapshot,
  '{blocks}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN b ->> 'type' = 'agent-notes' THEN jsonb_set(b, '{type}', '"agent-note"')
        ELSE b
      END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(v.snapshot -> 'blocks') WITH ORDINALITY AS t(b, ord)
  )
)
WHERE v.source_id = 'pages'
  AND v.snapshot -> 'blocks' @> '[{"type": "agent-notes"}]';

UPDATE entity_versions v
SET snapshot = jsonb_set(
  v.snapshot,
  '{blocks}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN b ->> 'type' = 'private-notes' THEN jsonb_set(b, '{type}', '"private-note"')
        ELSE b
      END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(v.snapshot -> 'blocks') WITH ORDINALITY AS t(b, ord)
  )
)
WHERE v.source_id = 'pages'
  AND v.snapshot -> 'blocks' @> '[{"type": "private-notes"}]';
