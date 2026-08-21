import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  tasksResource,
  TaskGraph,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  updateTask,
  setTaskAutoStart,
  clearTaskAutoStart,
} from "../core/endpoints";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";

// No `rank`: repositioning goes through the `moveTask` endpoint, which carries
// positional intent and mints the rank server-side against the complete sibling
// set. A client only ever holds a projection of that set.
export type TaskPatch = Partial<{
  title: string;
  description: string | null;
  drop: boolean;
  hold: boolean;
  folderId: string | null;
}>;

export type AutoStartModel = ConversationModel | "none";

export async function patchTask(id: string, patch: TaskPatch): Promise<void> {
  await fetchEndpoint(updateTask, { id }, { body: patch });
}

export async function setAutoStart(
  id: string,
  model: AutoStartModel,
): Promise<void> {
  if (model === "none") {
    await fetchEndpoint(clearTaskAutoStart, { id });
    return;
  }
  await fetchEndpoint(setTaskAutoStart, { id }, { body: { model } });
}

export function useTask(id: string | null | undefined): TaskListItem | null {
  const result = useResource(tasksResource);
  if (!id || result.pending) return null;
  return result.data.find((t) => t.id === id) ?? null;
}

/**
 * How many tasks are waiting on a task — pending until the task set is known.
 *
 * A count of `0` is a real answer ("nothing is waiting on it"); the pending arm
 * is what "we don't know yet" looks like, so a surface can render a loading
 * affordance instead of quietly claiming zero.
 */
export type DependentCountResult =
  { pending: true } | { pending: false; count: number };

// One TaskGraph per task-list snapshot, shared by every caller in a render pass.
// live-state hands out a fresh array whenever the list changes and never mutates
// one in place, so the array's identity IS the graph's cache key — and the entry
// dies with the snapshot. Without this, a list of rows each showing a count
// rebuilds the whole graph once per row.
const GRAPH_BY_SNAPSHOT = new WeakMap<readonly TaskListItem[], TaskGraph>();

function graphFor(tasks: readonly TaskListItem[]): TaskGraph {
  const cached = GRAPH_BY_SNAPSHOT.get(tasks);
  if (cached) return cached;
  const graph = TaskGraph.from(tasks);
  GRAPH_BY_SNAPSHOT.set(tasks, graph);
  return graph;
}

/**
 * The number of ACTIVE tasks transitively blocked on `id` — the single
 * derivation shared by every surface that shows or acts on that count (the
 * conversation Tasks button, the per-row conversation chip, the drop-dependents
 * action), so two of them can never disagree about how many tasks are waiting.
 */
export function useActiveDependentCount(
  id: string | null | undefined,
): DependentCountResult {
  const result = useResource(tasksResource);
  if (result.pending) return { pending: true };
  // No task ⇒ a determinate zero, not an unknown: nothing can wait on it.
  if (!id) return { pending: false, count: 0 };
  return {
    pending: false,
    count: graphFor(result.data).activeDependents(id).length,
  };
}
