import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { attemptsResource, tasksResource } from "@plugins/tasks/shared";

const currentWorktree = (() => {
  const host = window.location.hostname;
  return host.endsWith(".localhost") ? host.replace(/\.localhost$/, "") : null;
})();

export function AttemptTitle() {
  const { data: attempts } = useResource(attemptsResource);
  const { data: tasks } = useResource(tasksResource);

  const title = useMemo(() => {
    if (!currentWorktree || !attempts || !tasks) return null;
    const attempt = attempts.find((a) =>
      a.worktreePath.endsWith("/" + currentWorktree),
    );
    if (!attempt) return null;
    return tasks.find((t) => t.id === attempt.taskId)?.title ?? null;
  }, [attempts, tasks]);

  if (!title) return null;

  return (
    <span className="text-sm font-medium truncate max-w-xs" title={title}>
      {title}
    </span>
  );
}
