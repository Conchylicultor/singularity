import { and, asc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { BlockSchema, PageRowSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { pagesResource, blocksResource } from "../../core/resources";
import type { Block, PageRow } from "../../core/schemas";
import { docOrderPaths } from "./page-doc-order";
import { _blocks } from "./tables";

// Element-wise rank-path comparison — the document-order comparator. Sorting in
// JS with `Rank.compare` is deliberate and load-bearing: see the collation note
// on `docOrderPaths`. A shorter path can never be a proper prefix of a longer
// one within a group (same note), so the length tiebreak is unreachable defence.
function comparePaths(a: readonly string[], b: readonly string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = Rank.compare(Rank.from(a[i]!), Rank.from(b[i]!));
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

/**
 * All live pages (`type="page"` blocks), each carrying a derived `docRank`, and
 * returned so that **array order ≡ `docRank` order** within every sidebar
 * sibling group (the tree's `buildTree` preserves array order, so this is what
 * fixes display order).
 *
 * Two relations, kept strictly separate:
 *
 * - **Membership** is the plain drizzle select, and must NEVER become a function
 *   of the traversal. A page whose ancestor chain cannot resolve still gets a
 *   row: otherwise it would vanish not just from the sidebar but from the `[[`
 *   picker, breadcrumbs, the story gallery and the blog panel. The drizzle
 *   select also guarantees the `page_blocks → pages` read-set edge regardless of
 *   how the raw CTE is written.
 * - **Order** is `docOrderPaths()`, looked up ONTO those rows.
 *
 * Invariant: **`docRank` derives from ranks, not content.** The ~1s `data.text`
 * projection re-runs this loader on every keystroke burst; because no `data`
 * feeds the ordering, the result is identical and the live-state diff is empty —
 * no push.
 *
 * `executor` is injectable for the db-fixture tests; production passes `db`.
 */
export async function loadPages(
  executor: NodePgDatabase = db,
): Promise<PageRow[]> {
  const rows = (await executor
    .select()
    .from(_blocks)
    // Trashed pages disappear from the sidebar; the change-feed re-runs this on
    // the trash/restore UPDATE, so the exclusion is membership-correct.
    .where(and(eq(_blocks.type, PAGE_BLOCK_TYPE), isNull(_blocks.deletedAt)))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt))) as unknown as Block[];

  const paths = await docOrderPaths(executor);

  // The sidebar's sibling group is "pages sharing a `pageId`" — the ONE space a
  // `docRank` is comparable within. Insertion order follows the select above, so
  // the group emission order below is deterministic.
  const groups = new Map<string | null, Block[]>();
  for (const row of rows) {
    const group = groups.get(row.pageId);
    if (group) group.push(row);
    else groups.set(row.pageId, [row]);
  }

  const ordered: PageRow[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const pa = paths.get(a.id);
      const pb = paths.get(b.id);
      // An unresolved path sorts LAST within its group, by raw `rank`. This
      // completes the total order for a degenerate input (a live page whose
      // ancestor chain is broken) — the row is kept and deterministically
      // placed, not absorbed. Provably dead code: `resolveLiveParent` (page-id.ts)
      // 404s a trashed/missing destination parent, which was the sole way to mint
      // a dangling pointer.
      if (!pa || !pb) {
        if (pa) return -1;
        if (pb) return 1;
        return Rank.compare(a.rank, b.rank);
      }
      return comparePaths(pa, pb);
    });
    // A REAL minted fractional key, never an encoded path: a composite string
    // like "a1/a0" fails `generateKeyBetween`'s alphabet validation, which would
    // abort every drop. One fresh, evenly-spaced run per group.
    const docRanks = Rank.nBetween(null, null, group.length);
    for (const [i, row] of group.entries()) {
      ordered.push({ ...row, docRank: docRanks[i]! });
    }
  }
  return ordered;
}

// All pages (`type="page"` blocks), in document order per sidebar sibling group.
// The sidebar tree is built from these by `pageId` (the nearest page ancestor —
// `parentId` may point at a content block) and ordered by `docRank`.
export const pagesLiveResource = defineResource<PageRow[]>({
  key: pagesResource.key,
  mode: "push",
  schema: z.array(PageRowSchema),
  loader: () => loadPages(),
});

// A page's content forest: EVERY block whose nearest page ancestor is `pageId`,
// sub-page rows included. There is no type filter, and there must not be — the
// server's reducer (`loadPageBlocks`) has always run over exactly this set, so
// filtering here made client and server mint fractional-index ranks over
// different sibling sets, which is how two siblings ended up sharing `"a0"`.
//
// A sub-page row is automatically a LEAF of this forest: its own content carries
// `page_id = <the sub-page's id>`, a different partition. So `(parent_id, rank)`
// is one real, rendered ordering — the sidebar's page tree is a filtered
// subsequence of it, not a separate ordering space.
export const blocksLiveResource = defineResource<Block[], { pageId: string }>({
  key: blocksResource.key,
  mode: "push",
  schema: z.array(BlockSchema),
  loader: async ({ pageId }) =>
    db
      .select()
      .from(_blocks)
      .where(and(eq(_blocks.pageId, pageId), isNull(_blocks.deletedAt)))
      .orderBy(asc(_blocks.rank), asc(_blocks.createdAt)) as unknown as Promise<Block[]>,
});
