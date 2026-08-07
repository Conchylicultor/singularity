import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { todoTaskResource } from "../../shared/schemas";
import { todoTask } from "./tables";

const t = todoTask.table;

// Server half of the per-card link read, keyed via the shared client descriptor
// (two-arg form) so `keyOf` is declared once and the two runtimes cannot drift.
//
// `identityTable` scopes recompute to writes on this table, so a dispatch on one
// card never recomputes an unrelated resource.
//
// **No `ctx.affectedIds` branch, and here that is a choice rather than a
// limitation.** Unlike `agent-notes-authors` — whose composite key means the
// change-feed can never pass affected ids at all — this table's primary key IS
// its single `parent_id` column, so a scoped refill is available. It would be
// `WHERE parent_id = blockId AND parent_id IN (…)`: the same primary-key seek
// the FULL load already is, plus an `inArray` that can only ever confirm or
// exclude the one row. There is no work to save, so the branch would be
// machinery standing in front of nothing.
export const todoTaskServerResource = defineResource(todoTaskResource, {
  identityTable: "page_blocks_ext_todo_task",
  loader: ({ blockId }) =>
    db
      .select({ blockId: t.parentId, taskId: t.taskId, createdAt: t.createdAt })
      .from(t)
      .where(eq(t.parentId, blockId)),
});
