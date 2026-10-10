import type { LaunchCandidate } from "@plugins/tasks/plugins/automations/server";
import type { SidequestTask } from "@plugins/tasks/plugins/task-track/server";

/** What `{{description}}` says for a task whose title is all there is. */
export const NO_DESCRIPTION = "(No description — the title is the whole task.)";

/**
 * The ready sidequests as launch candidates, in the order given (oldest
 * first), each with its prompt variables.
 */
export function sidequestCandidates(
  tasks: readonly SidequestTask[],
): LaunchCandidate[] {
  return tasks.map((task) => ({
    taskId: task.id,
    variables: {
      taskId: task.id,
      title: task.title.trim() || "Untitled",
      description: task.description?.trim() || NO_DESCRIPTION,
    },
  }));
}
