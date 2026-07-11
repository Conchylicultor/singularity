import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
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
    // `NULLS NOT DISTINCT` because root pages share `parent_id IS NULL` — they
    // are one sibling list, and the default NULL semantics would exempt exactly
    // that list from the guard.
    //
    // NOT deferrable: drizzle cannot emit `DEFERRABLE`, and hand-written DDL is
    // barred (generated migrations are hash-guarded; data migrations are
    // DML-only). So the check is per-tuple, and any writer that PERMUTES ranks
    // among siblings must vacate the pairs it reassigns before claiming them —
    // see `rank-park.ts`. A plain swap has no safe update order; only a scratch
    // value does.
    unique("page_blocks_parent_rank_uq").on(t.parentId, t.rank).nullsNotDistinct(),
  ],
);
