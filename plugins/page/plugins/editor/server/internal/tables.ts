import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";

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
    data: jsonb("data").notNull().default({}),
    rank: rankText("rank").notNull(),
    expanded: boolean("expanded").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("page_blocks_page_parent_rank_idx").on(t.pageId, t.parentId, t.rank),
    index("page_blocks_page_id_idx").on(t.pageId),
  ],
);
