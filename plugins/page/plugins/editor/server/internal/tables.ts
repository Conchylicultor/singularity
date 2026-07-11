import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { rankText } from "@plugins/primitives/plugins/rank/core";
import type { BlockData } from "../../core";

// One uniform tree of blocks. A "page" is just a block of `type="page"` whose
// payload (`{ title, icon }`) lives in `data` like every other block type —
// there is no separate page table. `parentId` is the single adjacency list
// (pages and content share it); root pages have `parentId = null`.
//
// `pageId` is the denormalized nearest `type="page"` ancestor (maintained on
// insert + reparent via computePageId / recomputePageIdSubtree). It scopes a
// page's content cheaply and partitions the blocks live resource. It is a
// nullable self-FK: a page row at the tree root has `pageId = null`.
export const _blocks = pgTable(
  "page_blocks",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").references((): AnyPgColumn => _blocks.id, {
      onDelete: "cascade",
    }),
    parentId: text("parent_id").references((): AnyPgColumn => _blocks.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    // Branded so every write must come from `parseBlockData()` (the sole `BlockData`
    // minting site) — an unvalidated `data` is a compile error, not a convention.
    // `$type<>` is type-only: it produces NO migration and no DDL change, and reads
    // are unaffected (`BlockData` is assignable to the `unknown` readers accept).
    data: jsonb("data").notNull().default({} as BlockData).$type<BlockData>(),
    rank: rankText("rank").notNull(),
    expanded: boolean("expanded").notNull().default(true),
    // NULL = live. A soft delete (trash) sets `deletedAt` + `trashEntryId`
    // instead of DELETEing the row, so the self-referential FK cascades never
    // fire — descendants, `page_block_docs` CRDT text, ext side-tables, and
    // version history all survive until purge. `trashEntryId` correlates the
    // flagged subtree to its `trash_entries` ledger row for exact-restore.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    trashEntryId: text("trash_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("page_blocks_page_parent_rank_idx").on(t.pageId, t.parentId, t.rank),
    index("page_blocks_page_id_idx").on(t.pageId),
    // Siblings order by `rank`, so two of them sharing one is not a near-miss —
    // it is an unordered pair, and `Rank.between(r, r)` throws rather than
    // inventing a key. That crash is how this was found: the sidebar minted a
    // rank over the `type='page'` projection of a `(parent_id, rank)` space it
    // only half sees, and landed on a content block's key.
    //
    // NOT deferrable: drizzle cannot emit `DEFERRABLE`, and hand-written DDL is
    // barred (generated migrations are hash-guarded; data migrations are
    // DML-only). So the check is per-tuple, and any writer that PERMUTES ranks
    // among siblings must vacate the pairs it reassigns before claiming them —
    // see `rank-park.ts`. A plain swap has no safe update order; only a scratch
    // value does.
    //
    // Two PARTIAL unique indexes, both `WHERE deleted_at IS NULL`, so a TRASHED
    // row keeps its `(parent_id, rank)` without blocking a new live sibling from
    // reclaiming that slot (and restore re-ranks a colliding root — see
    // `trash-blocks.ts`). Split in two because drizzle-orm 0.36.4's index builder
    // has no `nullsNotDistinct`: the `parent_id IS NULL` root-page sibling list
    // shares one NULL parent, so the default NULL-distinct semantics would exempt
    // exactly that list from the guard — the second index constrains `rank` alone
    // over live root rows to close it.
    uniqueIndex("page_blocks_parent_rank_live_uq")
      .on(t.parentId, t.rank)
      .where(sql`deleted_at IS NULL AND parent_id IS NOT NULL`),
    uniqueIndex("page_blocks_root_rank_live_uq")
      .on(t.rank)
      .where(sql`deleted_at IS NULL AND parent_id IS NULL`),
    index("page_blocks_trash_entry_idx").on(t.trashEntryId),
  ],
);
