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
// dispatch on one card never recomputes an unrelated RESOURCE. It does not say
// which of them are THIS tuple's, so within this resource every write still
// wakes every subscribed `{ blockId }` tuple: each runs its own primary-key
// seek, finds the changed row is not theirs, and diffs to empty.
//
// It is tempting to look at one of those seeks — a one-row lookup a scoped
// refill could not make any narrower — and conclude there is no work to save.
// That answers the wrong question. The seek is cheap; there is one per open
// card per write, and how many that is belongs to the page, not to this
// resource. Bounding it needs the runtime to intersect ids BEFORE scheduling,
// which is what a `membership` declaration is for. Declaring one here was tried
// and reverted (it caused a cross-context delivery regression); the scoping is
// being redesigned under its own task.
//
// The loader ignores `ctx.affectedIds`, and there it genuinely is free: the read
// is already scoped to one row by `params.blockId`, so a scoped refill and a
// full one are the same query.
export const todoTaskServerResource = defineResource(todoTaskResource, {
  identityTable: "page_blocks_ext_todo_task",
  loader: ({ blockId }) =>
    db
      .select({ blockId: t.parentId, taskId: t.taskId, createdAt: t.createdAt })
      .from(t)
      .where(eq(t.parentId, blockId)),
});
