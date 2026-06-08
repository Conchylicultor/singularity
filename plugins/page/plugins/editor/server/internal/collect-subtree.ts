import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";

// Root id plus every descendant via parent_id — the exact set ON DELETE CASCADE
// will remove. Lets delete hooks snapshot subtree-dependent state before it
// vanishes. Returns [] for a non-existent root.
export async function collectBlockSubtree(rootId: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM page_blocks WHERE id = ${rootId}
      UNION ALL
      SELECT b.id FROM page_blocks b JOIN subtree s ON b.parent_id = s.id
    )
    SELECT id FROM subtree
  `);
  return result.rows.map((r) => r.id);
}
