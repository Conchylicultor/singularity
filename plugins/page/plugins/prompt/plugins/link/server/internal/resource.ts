import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import {
  blockPromptTasksResource as blockPromptTasksDescriptor,
  promptTaskOriginsResource as promptTaskOriginsDescriptor,
} from "../../shared/schemas";
import { _tasksPromptBlockExt, promptBlock } from "./tables";

const t = promptBlock.table;

const linkColumns = {
  taskId: t.parentId,
  pageId: t.pageId,
  blockId: t.blockId,
  createdAt: t.createdAt,
};

// Per-block launched-task list (keyed, params `{ blockId }`, identityTable
// "tasks_ext_prompt_block"). Hand-written like `pushesByAttemptResource`: this
// keys on `block_id`, a FOREIGN column, so `windowQueryResource`'s `point`
// membership cannot serve it — `point.by` must be the identity pk, and the
// identity pk here is `parent_id` (the task id).
//
// The identityTable scopes recompute, so an extension-row change is delivered to
// every subscribed block tuple; the scoped refill (`WHERE block_id = X AND
// parent_id IN affectedIds`) returns the row only for the owning block, so other
// tuples no-op. FULL load = one block's tasks (bounded), oldest-first so the
// chips read in launch order.
export const blockPromptTasksServerResource = defineResource(
  blockPromptTasksDescriptor,
  {
    identityTable: "tasks_ext_prompt_block",
    fanOut: {
      reason:
        "the params key `block_id`, a FOREIGN column — the identity pk the change feed emits ids in is `parent_id` (the task id), so a changed id cannot be compared against a tuple's blockId; the scoped refill still returns rows only for the owning block, so what fans out is the call count, not the payload",
    },
    loader: async ({ blockId }, ctx) =>
      ctx?.affectedIds
        ? db
            .select(linkColumns)
            .from(t)
            .where(
              and(
                eq(t.blockId, blockId),
                inArray(t.parentId, [...ctx.affectedIds]),
              ),
            )
        : db
            .select(linkColumns)
            .from(t)
            .where(eq(t.blockId, blockId))
            .orderBy(asc(t.createdAt)),
  },
);

// The task-side read (`WHERE parent_id = taskId`), which the block-keyed
// resource above does not serve. Compiled keyed query-resource — the default
// identityTable-scoped keyed resource. Plain (unbounded) `queryResource` on
// purpose: the set is bounded by the domain — at most one row per task,
// co-bounded with the already boot-critical unbounded-legacy `tasks` resource —
// and migrates to the bounded working-set contract together with it.
export const promptTaskOriginsServerResource = queryResource(
  promptTaskOriginsDescriptor,
  {
    from: _tasksPromptBlockExt,
    select: {
      parentId: _tasksPromptBlockExt.parentId,
      pageId: _tasksPromptBlockExt.pageId,
      blockId: _tasksPromptBlockExt.blockId,
    },
  },
);
