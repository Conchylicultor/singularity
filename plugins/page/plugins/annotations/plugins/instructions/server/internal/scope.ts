import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type DbExecutor } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/core";
import { humanAudienceTypes } from "@plugins/page/plugins/annotations/server";
import { instructionsBlock } from "../../core";

/**
 * One instructions block an agent must receive — an inline `<instructions>` card
 * or an `<instructions-page>` — and the part of the wiki it covers.
 */
export interface InstructionsRef {
  /** The block's row id: the card's, or the instructions page's own. */
  id: string;
  /** Which of the two forms it is. */
  form: "card" | "page";
  /** Handed to every conversation at its start (`data.global === true`). */
  global: boolean;
  /**
   * The instructions page's own title, for a pointer to it. `null` for a card,
   * which has no title of its own.
   */
  title: string | null;
  /**
   * The page whose subtree these instructions cover, with its title (`""` when
   * untitled):
   *
   * - a card covers the page it sits on (its `page_id`);
   * - an instructions page covers its PARENT page (its `page_id`), the way a
   *   `CLAUDE.md` covers the folder it sits in — or, at the top level where it
   *   has no parent, only itself.
   */
  covers: { pageId: string; title: string };
}

const RowSchema = z.object({
  id: z.string(),
  type: z.string(),
  global: z.boolean(),
  title: z.string().nullable(),
  covers_page_id: z.string(),
  covers_title: z.string().nullable(),
});
type Row = z.infer<typeof RowSchema>;

function refOf(row: Row): InstructionsRef {
  return {
    id: row.id,
    form: row.type === PAGE_BLOCK_TYPE ? "page" : "card",
    global: row.global,
    title: row.type === PAGE_BLOCK_TYPE ? (row.title ?? "") : null,
    covers: { pageId: row.covers_page_id, title: row.covers_title ?? "" },
  };
}

/**
 * The SQL predicate "this candidate sits inside a human-audience subtree of the
 * page it is displayed in" — its ancestors, walked up `parent_id` until the
 * partition's page row (`page_id`), include a row whose type is withheld from
 * agents. Such a block is never delivered: an agent must not receive what a
 * `/private` card holds, and a card inside one is part of what it holds.
 *
 * The type set is the annotation family's own (`humanAudienceTypes`), read at
 * call time. An empty set hides nothing, and is spelled `false` because
 * `IN ()` is not SQL.
 */
function hiddenCandidates(): SQL {
  const human = [...humanAudienceTypes()];
  const isHuman =
    human.length === 0
      ? sql`false`
      : sql`p.type IN (${sql.join(
          human.map((t) => sql`${t}`),
          sql`, `,
        )})`;
  return sql`
    anc AS (
      SELECT c.id AS candidate_id, c.parent_id AS ancestor_id, c.page_id AS stop_id, 1 AS steps
      FROM candidates c
      WHERE c.parent_id IS NOT NULL AND c.parent_id IS DISTINCT FROM c.page_id
      UNION ALL
      SELECT a.candidate_id, p.parent_id, a.stop_id, a.steps + 1
      FROM anc a
      JOIN page_blocks p ON p.id = a.ancestor_id
      WHERE p.parent_id IS NOT NULL
        AND p.parent_id IS DISTINCT FROM a.stop_id
        AND a.steps < 10000
    ),
    hidden AS (
      SELECT DISTINCT a.candidate_id AS id
      FROM anc a
      JOIN page_blocks p ON p.id = a.ancestor_id
      WHERE ${isHuman}
    )`;
}

/**
 * The page a candidate covers — see {@link InstructionsRef.covers}. A page row's
 * `page_id` is the page it is DISPLAYED in, i.e. its parent.
 */
const COVERS_PAGE_ID = sql.raw(
  `CASE WHEN b.type = '${PAGE_BLOCK_TYPE}' THEN COALESCE(b.page_id, b.id) ELSE b.page_id END`,
);

/** A live instructions page: a `page` row whose data says `instructions: true`. */
const IS_INSTRUCTIONS_PAGE = sql`(b.type = ${PAGE_BLOCK_TYPE} AND b.data->>'instructions' = 'true')`;

/**
 * Every instructions block that covers `pageId`, ROOT-FIRST — the order an agent
 * should read them in, the general before the particular.
 *
 * One recursive CTE walks up `page_blocks.page_id` from the page to the root (the
 * server twin of the Pages app's breadcrumb ancestry) and collects, among LIVE
 * rows:
 *
 * - `<instructions>` cards sitting on any page of that chain;
 * - instructions pages displayed in any page of the chain (they cover their
 *   parent), and any page of the chain that is itself an instructions page.
 *
 * Anything inside a human-audience subtree is skipped (`hiddenCandidates`).
 * Within one covered page, cards come before pages, then sibling order.
 *
 * Bounded by the chain: every candidate filter is `page_id ∈ chain` (the
 * `page_blocks_page_id_idx` seek) or `id ∈ chain`.
 *
 * Throws nothing for an unknown or trashed page: its chain is empty, so nothing
 * covers it — the caller has already resolved `pageId` from a live block.
 */
export async function instructionsInScope(
  pageId: string,
  executor: DbExecutor = db,
): Promise<InstructionsRef[]> {
  const rows = await executeRows(executor, {
    label: "instructions.in-scope",
    row: RowSchema,
    query: sql`
      WITH RECURSIVE chain AS (
        SELECT b.id, b.page_id, 0 AS depth
        FROM page_blocks b
        WHERE b.id = ${pageId} AND b.type = ${PAGE_BLOCK_TYPE} AND b.deleted_at IS NULL
        UNION ALL
        SELECT p.id, p.page_id, c.depth + 1
        FROM page_blocks p
        JOIN chain c ON p.id = c.page_id
        WHERE p.deleted_at IS NULL AND c.depth < 10000
      ),
      candidates AS (
        SELECT b.id, b.type, b.parent_id, b.page_id, b.rank, b.data,
          ${COVERS_PAGE_ID} AS covers_page_id
        FROM page_blocks b
        WHERE b.deleted_at IS NULL AND (
          (b.type = ${instructionsBlock.type} AND b.page_id IN (SELECT id FROM chain))
          OR (${IS_INSTRUCTIONS_PAGE} AND (
            b.page_id IN (SELECT id FROM chain) OR b.id IN (SELECT id FROM chain)
          ))
        )
      ),
      ${hiddenCandidates()}
      SELECT c.id, c.type,
        COALESCE(c.data->>'global' = 'true', false) AS global,
        c.data->>'title' AS title,
        c.covers_page_id,
        cov.data->>'title' AS covers_title
      FROM candidates c
      JOIN chain ch ON ch.id = c.covers_page_id
      JOIN page_blocks cov ON cov.id = c.covers_page_id
      WHERE c.id NOT IN (SELECT id FROM hidden)
      ORDER BY ch.depth DESC,
        (c.type = ${PAGE_BLOCK_TYPE}) ASC,
        c.rank ASC,
        c.id ASC
    `,
  });
  return rows.map(refOf);
}

/**
 * Every live instructions block marked `global` — cards and pages alike, handed
 * to every conversation at its start — skipping any inside a human-audience
 * subtree.
 *
 * Not bounded by a page chain: it scans `page_blocks` for the global marker, once
 * per conversation start. No index backs the `data->>'global'` filter; the
 * table's size makes that a sequential scan measured in milliseconds, and an
 * index is the fix if that timing ever says otherwise.
 */
export async function globalInstructions(
  executor: DbExecutor = db,
): Promise<InstructionsRef[]> {
  const rows = await executeRows(executor, {
    label: "instructions.global",
    row: RowSchema,
    query: sql`
      WITH RECURSIVE candidates AS (
        SELECT b.id, b.type, b.parent_id, b.page_id, b.rank, b.data,
          ${COVERS_PAGE_ID} AS covers_page_id
        FROM page_blocks b
        WHERE b.deleted_at IS NULL
          AND b.data->>'global' = 'true'
          AND (b.type = ${instructionsBlock.type} OR ${IS_INSTRUCTIONS_PAGE})
      ),
      ${hiddenCandidates()}
      SELECT c.id, c.type,
        true AS global,
        c.data->>'title' AS title,
        c.covers_page_id,
        cov.data->>'title' AS covers_title
      FROM candidates c
      JOIN page_blocks cov ON cov.id = c.covers_page_id AND cov.deleted_at IS NULL
      WHERE c.id NOT IN (SELECT id FROM hidden)
      ORDER BY cov.data->>'title' ASC, (c.type = ${PAGE_BLOCK_TYPE}) ASC, c.rank ASC, c.id ASC
    `,
  });
  return rows.map(refOf);
}
