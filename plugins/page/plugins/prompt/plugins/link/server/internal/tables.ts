import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { promptBlockShape } from "../../shared/schemas";

// Provenance of a task launched from a `/prompt` page block: the page and the
// block it came from. Presence = the task originated from a prompt block.
//
// `pageId` / `blockId` are PLAIN TEXT with NO foreign key to `page_blocks` — by
// design. A task is real work and must survive its originating block being
// deleted: a CASCADE would destroy the task with the block, and a SET NULL would
// silently lose the provenance. The cost is a possibly-dangling `blockId`, which
// both readers handle naturally (the block-side window returns nothing; the
// task-side origin section renders nothing).
//
// The block-side window `WHERE block_id = X` (see ./resource.ts) needs an index
// of its own: the pk's implicit btree covers `parent_id` (the `taskId` key —
// what the task-side `:rows` point read seeks on) and nothing else, so without
// one that read is a seq scan. `(block_id, created_at)` serves both of the
// window's reads — the FULL load filters on `block_id` and orders by
// `created_at` over that one block's handful of rows, and the scoped refill
// (`block_id = X AND parent_id IN (…)`) seeks on the same leading column. Which
// plan the planner actually picks is its call: while the table is small it may
// prefer a bitmap scan plus a sort, and the trailing column costs nothing.
export const promptBlock = defineExtension(
  _tasks,
  "prompt_block",
  promptBlockShape,
  {
    indexes: (t, b) => [b.index("block_created").on(t.blockId, t.createdAt)],
  },
);
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksPromptBlockExt = promptBlock.table;
