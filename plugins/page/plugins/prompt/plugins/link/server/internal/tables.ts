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
// The reverse `WHERE block_id = X` lookup (see ./resource.ts) is an UNINDEXED
// seq scan. That is acceptable here: the table is domain-bounded to one row per
// prompt-launched task. If it ever needs an index, the structural fix is an
// `indexes` option on `defineExtension` — filed as task
// `task-1785249879009-19heph` — not a hand-written migration in this plugin.
export const promptBlock = defineExtension(_tasks, "prompt_block", {
  pageId: text("page_id").notNull(),
  blockId: text("block_id").notNull(),
});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksPromptBlockExt = promptBlock.table;
