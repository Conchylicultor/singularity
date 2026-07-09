import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";

// Root ids plus every descendant via parent_id — the exact set ON DELETE CASCADE
// will remove. Lets delete hooks snapshot subtree-dependent state before it
// vanishes. Deduped (`UNION`), so overlapping roots — a block and its own
// ancestor — collapse to one set. Returns [] for an empty or non-existent root
// set.
//
// The walk crosses page boundaries on purpose: a `type="page"` root's content
// rows are keyed `page_id = <that root>`, so a page-scoped `loadPageBlocks`
// never returns them — but the cascade wipes them all the same, and hooks must
// see exactly what vanishes.
export async function collectBlockSubtrees(rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const roots = sql.join(
    rootIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM page_blocks WHERE id IN (${roots})
      UNION
      SELECT b.id FROM page_blocks b JOIN subtree s ON b.parent_id = s.id
    )
    SELECT id FROM subtree
  `);
  return result.rows.map((r) => r.id);
}

/** Single-root convenience wrapper over {@link collectBlockSubtrees}. */
export async function collectBlockSubtree(rootId: string): Promise<string[]> {
  return collectBlockSubtrees([rootId]);
}
