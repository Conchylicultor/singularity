import type { InlineTokenReferent } from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/server";
import { getAttempt, getTask } from "@plugins/tasks/plugins/tasks-core/server";

/**
 * An `att-<id>` token's name, for text a model reads: the title of the task the
 * attempt works on — the name the chip falls back to before its conversation
 * has a title of its own.
 */
export async function resolveAttemptReferent(
  id: string,
): Promise<InlineTokenReferent> {
  const attempt = await getAttempt(id);
  if (!attempt) return { found: false };
  const task = await getTask(attempt.taskId);
  return task ? { found: true, title: task.title } : { found: false };
}
