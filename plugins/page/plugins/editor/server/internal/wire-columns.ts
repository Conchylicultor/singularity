import { _blocks } from "./tables";

/**
 * The public projection of `page_blocks`: exactly the columns `BlockSchema`
 * declares, and nothing else.
 *
 * The table carries two columns the wire type does not — `deletedAt` and
 * `trashEntryId`, the soft-delete bookkeeping. A `db.select().from(_blocks)`
 * therefore reads a row WIDER than a `Block`, which is why every such read
 * needed a type assertion to hand its rows out (the parse-based reads were
 * merely stripping the extras at runtime instead).
 *
 * ONE spelling, shared by every read that emits `Block`s: the live blocks
 * resource, the sidebar's page loader, and the `listBlocks` endpoint that is the
 * HTTP twin of that resource. Adding a column to `BlockSchema` reaches all three
 * at once, and `tsc` then checks each of them.
 */
export const BLOCK_WIRE_COLUMNS = {
  id: _blocks.id,
  pageId: _blocks.pageId,
  parentId: _blocks.parentId,
  type: _blocks.type,
  data: _blocks.data,
  rank: _blocks.rank,
  expanded: _blocks.expanded,
  createdAt: _blocks.createdAt,
  updatedAt: _blocks.updatedAt,
} as const;
