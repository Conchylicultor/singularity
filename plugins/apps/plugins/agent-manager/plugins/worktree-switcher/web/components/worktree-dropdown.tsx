import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { attemptsResource, tasksResource } from "@plugins/tasks/plugins/tasks-core/core";

const currentWorktree = (() => {
  const host = window.location.hostname;
  return host.endsWith(".localhost") ? host.replace(/\.localhost$/, "") : "head";
})();

const isAgentWorktree = currentWorktree !== "head" && currentWorktree !== "singularity";

export function WorktreeDropdown() {
  const attemptsResult = useResource(attemptsResource);
  const tasksResult = useResource(tasksResource);

  const taskTitle = useMemo(() => {
    if (!isAgentWorktree) return null;
    if (attemptsResult.pending || tasksResult.pending) return null;
    const attempt = attemptsResult.data.find((a) =>
      a.worktreePath.endsWith("/" + currentWorktree),
    );
    if (!attempt) return null;
    return tasksResult.data.find((t) => t.id === attempt.taskId)?.title ?? null;
  }, [attemptsResult, tasksResult]);

  return (
    <WithTooltip content={`Current worktree: ${currentWorktree}`}>
      <Frame
        gap="xs"
        // eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of the ActionBar.Item slot row, so the label can truncate
        className="min-w-0 px-sm py-xs text-muted-foreground cursor-default"
        leading={<StatusDot size="sm" colorClass="bg-primary" />}
        content={
          <Text as="span" variant="body" className="truncate">
            {taskTitle ?? currentWorktree}
          </Text>
        }
      />
    </WithTooltip>
  );
}
