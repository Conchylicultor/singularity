import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@plugins/database/server";
import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";

// One page's rank path: the ranks from a direct child of its nearest PAGE
// ancestor, down through any intervening content blocks, to the page row itself.
// Comparing two such paths element-wise IS document order within a `pageId`
// group — see the correctness note on `docOrderPaths`.
type RankPath = string[];

/**
 * Rank path per live page row, keyed by page row id — the input the `pages`
 * loader orders each sidebar sibling group by.
 *
 * An **upward** recursive CTE from the page rows: only pages plus their ancestor
 * chains (~pages × depth), never the whole forest. This runs on EVERY
 * `page_blocks` write — including the ~1s `data.text` projection while typing —
 * so a downward full-forest walk is not affordable. drizzle cannot emit
 * recursive CTEs, so this is raw `sql`, mirroring the precedent in `page-id.ts`
 * (`recomputePageIdSubtree`) and `collect-subtree.ts`.
 *
 * The walk stops exactly at the nearest page ancestor (`cursor = page_id`), so
 * `path` runs from a direct child of the parent page down to the page row.
 * Edge cases, all correct: a root page (`page_id` and `parent_id` both null)
 * terminates at the base with `path = [rank]`; a page whose parent IS a page has
 * `cursor = page_id` at the base, likewise terminal; a page under a root-level
 * content block walks to `parent_id IS NULL` and lands in the `null` group with
 * a content-rank prefix.
 *
 * **Correctness.** Within one `pageId` group, comparing paths element-wise is
 * DFS pre-order. No path is a proper prefix of another: if `path(X)` prefixed
 * `path(Y)`, then `Y` descends *through* `X`, making `X` a page ancestor of `Y`
 * — so `pageId(Y) = X ≠ pageId(X)`, contradicting same-group. Paths therefore
 * diverge at some index where both elements are ranks of live siblings under a
 * common parent, distinct by `page_blocks_parent_rank_live_uq` /
 * `page_blocks_root_rank_live_uq`. Total order, no ties.
 *
 * Returns the map ONLY — **no ordering decision happens in SQL**, deliberately.
 * `rank_text` is a `TEXT COLLATE "C"` domain (byte order = rank order), but a
 * recursive CTE's column-type resolution can flatten the domain back to plain
 * `text`, silently reverting to locale collation — where `'a' < 'B'` while JS
 * `Rank.compare` says `'B' < 'a'`. The caller sorts in JS with `Rank.compare`;
 * do not "optimize" the sort back into this query.
 */
export async function docOrderPaths(
  executor: NodePgDatabase = db,
): Promise<Map<string, RankPath>> {
  // `${_blocks}` interpolates the drizzle table, which renders the identifier
  // DOUBLE-QUOTED (`"page_blocks"`). Load-bearing, not style: the read-set
  // extractor (`plugins/database/server/internal/client.ts`) matches only
  // `\b(from|join)\s+"([^"]+)"`, so raw SQL naming the table UNQUOTED captures
  // NOTHING — the `page_blocks → pages` live-state edge would never register and
  // the sidebar would silently stop updating. No error, no log. (`page-id.ts`'s
  // unquoted CTE is not a counter-precedent: it is a write path, which has no
  // read-set contract.)
  const result = await executor.execute<{ page_row_id: string; path: string[] }>(sql`
    WITH RECURSIVE up AS (
      SELECT b.id AS page_row_id, b.page_id, b.parent_id AS cursor,
             ARRAY[b.rank::text] AS path
      FROM ${_blocks} b
      WHERE b.type = ${PAGE_BLOCK_TYPE} AND b.deleted_at IS NULL
      UNION ALL
      SELECT u.page_row_id, u.page_id, p.parent_id, p.rank::text || u.path
      FROM up u
      JOIN ${_blocks} p ON p.id = u.cursor AND p.deleted_at IS NULL
      -- Terminal rows leave the recursive term and are selected below: the walk
      -- stops at the tree root (cursor IS NULL) or at the nearest PAGE ancestor
      -- (cursor = page_id).
      WHERE u.cursor IS NOT NULL
        AND u.cursor IS DISTINCT FROM u.page_id
        -- Cycle guard. A parent_id cycle would recurse forever and pin a pool
        -- connection — on a path that re-runs on every single write. Real
        -- nesting is far below the cap; a cycle simply terminates here.
        AND array_length(u.path, 1) < 64
    )
    SELECT page_row_id, path FROM up WHERE cursor IS NULL OR cursor = page_id
  `);

  const paths = new Map<string, RankPath>();
  for (const row of result.rows) paths.set(row.page_row_id, row.path);
  return paths;
}
