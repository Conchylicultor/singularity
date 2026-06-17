import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { attemptsResource, tasksResource } from "@plugins/tasks/core";

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
      <Text
        as="span"
        variant="body"
        className="flex min-w-0 items-center gap-xs px-sm py-xs text-muted-foreground cursor-default"
      >
        <StatusDot size="sm" colorClass="bg-primary" />
        <TruncatingText>{taskTitle ?? currentWorktree}</TruncatingText>
      </Text>
    </WithTooltip>
  );
}
