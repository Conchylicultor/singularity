import { z } from "zod";
import { keyedResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

// ---------------------------------------------------------------------------
// Block-side read: "which tasks did THIS prompt block launch?"
// ---------------------------------------------------------------------------

// One task launched from a prompt block. `pageId`/`blockId` are the provenance
// stamped at creation; they are carried on the row so a consumer never has to
// join back to the extension table.
export const PromptTaskLinkSchema = z.object({
  taskId: z.string(),
  pageId: z.string(),
  blockId: z.string(),
  createdAt: z.coerce.date(),
});
export type PromptTaskLink = z.infer<typeof PromptTaskLinkSchema>;

// Keyed by `{ blockId }` — a FOREIGN column, not the identity pk — so this
// CANNOT be a `windowQueryResource` (`point.by` must be the identity pk) and is
// instead the hand-written keyed `defineResource` shape copied from
// `pushesByAttemptResource`. Bounded by the block: a FULL load is one block's
// launched tasks, and the row set never grows with the collection. NOT
// bootCritical — the block renderer mounts route-scoped, so it hydrates
// post-mount via its sub-ack (the page-block-doc precedent).
export const blockPromptTasksResource = keyedResourceDescriptor<
  PromptTaskLink[],
  { blockId: string }
>(
  "prompt-block-tasks",
  z.array(PromptTaskLinkSchema),
  [],
  (row) => (row as PromptTaskLink).taskId,
);

// ---------------------------------------------------------------------------
// Task-side read: "which page/block did THIS task come from?"
// ---------------------------------------------------------------------------

// One row per prompt-launched task, keyed on the side-table PK (`parentId` =
// the task id). This is the reverse of the block-side read above; the origin
// section in the pages app resolves a task → its page.
export const PromptTaskOriginSchema = z.object({
  parentId: z.string(),
  pageId: z.string(),
  blockId: z.string(),
});
export type PromptTaskOrigin = z.infer<typeof PromptTaskOriginSchema>;

// Keyed query-resource contract: rows key on `parentId` (the side-table PK).
// Plain (unbounded) `queryResource` on purpose: the set is bounded by the
// domain — at most one row per task, co-bounded with the already boot-critical
// unbounded-legacy `tasks` resource — and migrates to the bounded working-set
// contract together with it.
export const promptTaskOriginsResource = queryResourceDescriptor<PromptTaskOrigin>(
  "prompt-task-origins",
  PromptTaskOriginSchema,
  "parentId",
);
