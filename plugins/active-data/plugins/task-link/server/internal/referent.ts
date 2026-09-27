import type { InlineTokenReferent } from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/server";
import { getTask } from "@plugins/tasks/plugins/tasks-core/server";

/** A `task-<id>` token's task title, for text a model reads. */
export async function resolveTaskReferent(
  id: string,
): Promise<InlineTokenReferent> {
  const task = await getTask(id);
  return task ? { found: true, title: task.title } : { found: false };
}
