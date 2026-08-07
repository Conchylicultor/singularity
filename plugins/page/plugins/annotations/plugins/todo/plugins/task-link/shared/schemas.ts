import { z } from "zod";
import { keyedResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// The task ONE TODO card dispatched an agent onto, and when it was first
// dispatched. It carries the link and nothing else — no title, no status: those
// are the TASK's, they change without the link changing, and the client already
// holds them on the boot-critical `tasks` resource. Copying them here would make
// this row a second, drifting answer to a question the task list already
// answers.
export const TodoTaskLinkSchema = z.object({
  blockId: z.string(),
  taskId: z.string(),
  createdAt: z.coerce.date(),
});
export type TodoTaskLink = z.infer<typeof TodoTaskLinkSchema>;

// The link of ONE TODO card — an array of length 0 or 1, because the card's row
// id is the extension table's primary key (see the table's comment: one task per
// card is a fact of the schema, not a rule the endpoint remembers). It is an
// ARRAY rather than a nullable object because that is what a keyed live resource
// merges: deltas arrive per row, and "no row" is the empty array.
//
// Keyed with `{ blockId }` params — POINT membership, so the working set is
// bounded by construction: only a MOUNTED card subscribes, and a FULL load is
// one primary-key seek. It never grows with the collection, so this is not the
// legacy unbounded `queryResource` collection shape (see the bounded-working-set
// contract in the root CLAUDE.md); `agent-notes-authors` is the precedent it
// copies.
//
// NOT bootCritical: the card mounts route-scoped with its page, so it hydrates
// post-mount via its sub-ack — the same call `prompt-block-tasks` makes.
//
// Rows key on `taskId`, which is unique within one block by the table's own
// primary key (there is at most one row).
export const todoTaskResource = keyedResourceDescriptor<
  TodoTaskLink[],
  { blockId: string }
>(
  "todo-block-task",
  z.array(TodoTaskLinkSchema),
  [],
  (row) => (row as TodoTaskLink).taskId,
);
