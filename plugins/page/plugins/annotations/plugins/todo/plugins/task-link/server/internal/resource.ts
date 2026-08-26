import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { todoTaskResource } from "../../shared/schemas";
import { todoTask } from "./tables";

const t = todoTask.table;

// Server half of the per-card link read, keyed via the shared client descriptor
// (two-arg form) so `keyOf` is declared once and the two runtimes cannot drift.
//
// `identityTable` says which table's changes are this resource's own — a
// dispatch on one card never recomputes an unrelated RESOURCE. `rowIdentity`
// says which of them are THIS tuple's: the params name exactly one row of the
// table (`parent_id`, the PK, IS the blockId), so a dispatch on one card is
// scheduled for that card's tuple alone instead of waking every mounted card to
// run its own primary-key seek and diff to empty. The seek is cheap; there was
// one per open card per write, and how many that is belongs to the page. Routing
// only — the owning card's frames are unchanged.
//
// The loader ignores `ctx.affectedIds`, and there it genuinely is free: the read
// is already scoped to one row by `params.blockId`, so a scoped refill and a
// full one are the same query.
export const todoTaskServerResource = defineResource(todoTaskResource, {
  identityTable: "page_blocks_ext_todo_task",
  rowIdentity: ({ blockId }) => blockId,
  loader: ({ blockId }) =>
    db
      .select({ blockId: t.parentId, taskId: t.taskId, createdAt: t.createdAt })
      .from(t)
      .where(eq(t.parentId, blockId)),
});
