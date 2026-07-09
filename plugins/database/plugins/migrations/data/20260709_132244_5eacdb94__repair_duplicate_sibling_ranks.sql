-- Custom SQL migration file, put your code below! --
-- migration: 20260709_132244__repair_duplicate_sibling_ranks --

-- Repair duplicate sibling ranks in `page_blocks`, so that the UNIQUE
-- constraint the NEXT migration adds on (parent_id, rank) can be created.
--
-- How they arose: `page_blocks` has ONE ordering space (parent_id, rank), but
-- two live resources projected it disjointly — the sidebar saw only type='page'
-- rows, the content editor only the rest. Each client minted fractional-index
-- keys over the rows it could see. A sidebar drag computed
-- generateKeyBetween(null,'a1') = 'a0' and landed on a content block already
-- sitting at 'a0'. `Rank.between('a0','a0')` then threw on the next split. The
-- writers are fixed; this cleans up what they left behind.
--
-- The rewrite: within each duplicate (parent_id, rank) group, keep the earliest
-- row (created_at, id) on its rank and push the others to rank || '1', '2', …
--
-- Why those keys are valid AND order-preserving:
--
--   * `rank` is the `rank_text` domain (TEXT COLLATE "C"), so byte order IS rank
--     order, and R < R || <digit> holds trivially (prefix).
--   * R || d is a canonical fractional-indexing key: R's integer part with a
--     fractional part `d` carrying no trailing '0' — what validateOrderKey
--     demands. Hence digits start at '1' and the KEPT row stays on R: writing
--     R || '0' would be non-canonical and would break generateKeyBetween later.
--   * The `starts_with` guard requires that no OTHER sibling is a strict
--     prefix-extension of R. Given that, any sibling T > R differs from R at
--     some index inside R with T[i] > R[i]; R || d differs from T at that same
--     index the same way, so R || d < T. Nothing can interleave between the
--     repaired rows and the group's true successor — relative sibling order is
--     preserved exactly.
--
-- Bounded to 9 duplicates per group (digits '1'..'9'): an 11th would need a
-- two-digit suffix ending in '0' and stop being canonical. A group that large
-- means something is badly wrong, and leaving it unrepaired makes the next
-- migration's UNIQUE constraint fail loudly — the correct outcome.
--
-- Idempotent: once it has run there are no duplicate groups left, so a re-run
-- selects nothing.

WITH ranked AS (
  SELECT
    id,
    parent_id,
    rank,
    row_number() OVER (
      PARTITION BY parent_id, rank
      ORDER BY created_at, id
    ) AS rn
  FROM page_blocks
),
repairable AS (
  SELECT r.id, r.rank, r.rn
  FROM ranked r
  WHERE r.rn > 1
    AND r.rn <= 10
    AND NOT EXISTS (
      SELECT 1
      FROM page_blocks s
      WHERE s.parent_id IS NOT DISTINCT FROM r.parent_id
        AND s.rank <> r.rank
        AND starts_with(s.rank, r.rank)
    )
)
UPDATE page_blocks b
SET rank = d.rank || (d.rn - 1)::text,
    updated_at = now()
FROM repairable d
WHERE b.id = d.id;
