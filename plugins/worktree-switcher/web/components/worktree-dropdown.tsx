import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { attemptsResource, tasksResource } from "@plugins/tasks/shared";

const currentWorktree = (() => {
  const host = window.location.hostname;
  return host.endsWith(".localhost") ? host.replace(/\.localhost$/, "") : "head";
})();

const isAgentWorktree = currentWorktree !== "head" && currentWorktree !== "singularity";

export function WorktreeDropdown() {
  const { data: attempts } = useResource(attemptsResource);
  const { data: tasks } = useResource(tasksResource);

  const taskTitle = useMemo(() => {
    if (!isAgentWorktree) return null;
    const attempt = attempts.find((a) =>
      a.worktreePath.endsWith("/" + currentWorktree),
    );
    if (!attempt) return null;
    return tasks.find((t) => t.id === attempt.taskId)?.title ?? null;
  }, [attempts, tasks]);

  return (
    <WithTooltip content={`Current worktree: ${currentWorktree}`}>
      <span className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground cursor-default">
        <span className="size-1.5 rounded-full bg-primary shrink-0" />
        {taskTitle ?? currentWorktree}
      </span>
    </WithTooltip>
  );
}
