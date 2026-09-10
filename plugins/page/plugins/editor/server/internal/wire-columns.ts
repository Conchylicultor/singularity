import { liveBlocks } from "./live-blocks";

/**
 * The public projection of `page_blocks`: exactly the columns `BlockSchema`
 * declares, and nothing else — read off the LIVE relation, since every read
 * that emits `Block`s is a read of live rows.
 *
 * The table carries two columns the wire type does not — `deletedAt` and
 * `trashEntryId`, the soft-delete bookkeeping. A `db.select().from(liveBlocks)`
 * therefore reads a row WIDER than a `Block`, which is why every such read
 * needed a type assertion to hand its rows out (the parse-based reads were
 * merely stripping the extras at runtime instead).
 *
 * ONE spelling, shared by every read that emits `Block`s: the live blocks
 * resource, the sidebar's page loader, and the `listBlocks` endpoint that is the
 * HTTP twin of that resource. Adding a column to `BlockSchema` reaches all three
 * at once, and `tsc` then checks each of them. Binding the columns to
 * `liveBlocks` rather than `_blocks` is what makes a `select(BLOCK_WIRE_COLUMNS)
 * .from(_blocks)` a drizzle type error: the projection can only be read from
 * the relation it names.
 *
 * Annotated, not inferred: the inferred type spells `BlockData`'s private brand
 * symbol, which a declaration cannot name (TS4023 — the type-check emits
 * declarations, see its CLAUDE.md). Naming the columns through the exported
 * `liveBlocks` relation keeps the declaration writable, and the object literal
 * is still checked key for key against it.
 */
export const BLOCK_WIRE_COLUMNS: Pick<
  typeof liveBlocks,
  | "id"
  | "pageId"
  | "parentId"
  | "type"
  | "data"
  | "rank"
  | "expanded"
  | "createdAt"
  | "updatedAt"
> = {
  id: liveBlocks.id,
  pageId: liveBlocks.pageId,
  parentId: liveBlocks.parentId,
  type: liveBlocks.type,
  data: liveBlocks.data,
  rank: liveBlocks.rank,
  expanded: liveBlocks.expanded,
  createdAt: liveBlocks.createdAt,
  updatedAt: liveBlocks.updatedAt,
};
