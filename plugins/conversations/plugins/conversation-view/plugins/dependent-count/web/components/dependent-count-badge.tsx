import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, TaskGraph } from "@plugins/tasks/plugins/tasks-core/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/**
 * Muted "N blocked" chip for a task: counts the tasks transitively blocked by
 * `taskId`. Shared by the conversation toolbar (ActionBar) and the per-row
 * conversation item chips. Renders nothing when the count is zero or the task
 * is unknown.
 *
 * `expanded` keeps the "blocked" label always visible (conversation toolbar);
 * when collapsed (per-row item chips) the label only reveals on hover.
 */
export function DependentCountBadge({
  taskId,
  expanded = false,
}: {
  taskId: string | null | undefined;
  expanded?: boolean;
}) {
  const tasksResult = useResource(tasksResource);

  if (tasksResult.pending) return null;

  const count = taskId
    ? TaskGraph.from(tasksResult.data).activeDependents(taskId).length
    : 0;
  if (count === 0) return null;

  return (
    <Badge
      className="group/blocked"
      title={`${count} task${count === 1 ? "" : "s"} blocked on this task`}
    >
      {count}
      <span className={expanded ? "inline" : "hidden group-hover/blocked:inline"}>
        {" "}
        blocked
      </span>
    </Badge>
  );
}
