import type { InlineTokenReferent } from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/server";
import {
  getAttempt,
  getConversation,
  getTask,
} from "@plugins/tasks/plugins/tasks-core/server";

/**
 * A `conv-<id>` token's name, for text a model reads: the conversation's own
 * title, else the title of the task it works on (a fresh conversation has none
 * yet).
 */
export async function resolveConversationReferent(
  id: string,
): Promise<InlineTokenReferent> {
  const conv = await getConversation(id);
  if (!conv) return { found: false };
  const own = conv.title?.trim();
  if (own) return { found: true, title: own };
  const attempt = await getAttempt(conv.attemptId);
  const task = attempt ? await getTask(attempt.taskId) : null;
  return task ? { found: true, title: task.title } : { found: false };
}
