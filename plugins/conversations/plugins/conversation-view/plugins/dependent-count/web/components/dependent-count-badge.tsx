import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, countTransitiveDependents } from "@plugins/tasks/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";

/**
 * Muted "N blocked" chip for a task: counts the tasks transitively blocked by
 * `taskId`. Shared by the conversation toolbar (ActionBar) and the per-row
 * conversation item chips. Renders nothing when the count is zero or the task
 * is unknown.
 */
export function DependentCountBadge({ taskId }: { taskId: string | null | undefined }) {
  const tasksResult = useResource(tasksResource);

  if (tasksResult.pending) return null;

  const count = taskId ? countTransitiveDependents(taskId, tasksResult.data) : 0;
  if (count === 0) return null;

  return (
    <Badge
      className="group/blocked"
      title={`${count} task${count === 1 ? "" : "s"} blocked on this task`}
    >
      {count}
      <span className="hidden group-hover/blocked:inline">blocked</span>
    </Badge>
  );
}
