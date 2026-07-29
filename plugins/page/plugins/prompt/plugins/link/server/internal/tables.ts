import { text } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Provenance of a task launched from a `/prompt` page block: the page and the
// block it came from. Presence = the task originated from a prompt block.
//
// `pageId` / `blockId` are PLAIN TEXT with NO foreign key to `page_blocks` — by
// design. A task is real work and must survive its originating block being
// deleted: a CASCADE would destroy the task with the block, and a SET NULL would
// silently lose the provenance. The cost is a possibly-dangling `blockId`, which
// both readers handle naturally (the block-side query returns nothing; the
// task-side origin section renders nothing).
//
// The reverse `WHERE block_id = X` lookup (see ./resource.ts) needs an index of
// its own: the pk's implicit btree covers `parent_id` and nothing else, so
// without one that read is a seq scan. `(block_id, created_at)` is the pair
// because that single index serves both reads the block-keyed resource makes —
// the FULL load filters on `block_id` and returns oldest-first, so an ordered
// index scan can satisfy the ORDER BY without a sort, and the scoped refill
// (`block_id = X AND parent_id IN (…)`) seeks on the same leading column. Which
// plan the planner actually picks is its call: while the table is small it may
// prefer a bitmap scan plus a sort, and the trailing column costs nothing.
export const promptBlock = defineExtension(
  _tasks,
  "prompt_block",
  {
    pageId: text("page_id").notNull(),
    blockId: text("block_id").notNull(),
  },
  {
    indexes: (t, b) => [b.index("block_created").on(t.blockId, t.createdAt)],
  },
);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksPromptBlockExt = promptBlock.table;
