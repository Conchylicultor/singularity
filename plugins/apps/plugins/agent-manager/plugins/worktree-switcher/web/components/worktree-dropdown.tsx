import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import {
  attemptsResource,
  tasksResource,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  MAIN_COMPOSITION_ID,
  namespaceFromHost,
} from "@plugins/infra/plugins/namespace/core";

export function WorktreeDropdown() {
  const attemptsResult = useResource(attemptsResource);
  const tasksResult = useResource(tasksResource);

  // Read here rather than at module scope, which would make this file
  // unimportable without a DOM. `"head"` is what we render when the page is not
  // served under a namespace at all (bare `localhost`, a dev server) —
  // `namespaceFromHost` spells that `null`.
  const currentWorktree = namespaceFromHost(window.location.host) ?? "head";
  const isAgentWorktree =
    currentWorktree !== "head" && currentWorktree !== MAIN_COMPOSITION_ID;

  const taskTitle = useMemo(() => {
    if (!isAgentWorktree) return null;
    if (attemptsResult.pending || tasksResult.pending) return null;
    const attempt = attemptsResult.data.find((a) =>
      a.worktreePath.endsWith("/" + currentWorktree),
    );
    if (!attempt) return null;
    return tasksResult.data.find((t) => t.id === attempt.taskId)?.title ?? null;
  }, [attemptsResult, tasksResult, currentWorktree, isAgentWorktree]);

  return (
    // The label is the action bar's one elastic item: it absorbs the slack and
    // gives it back under pressure, so the worktree name ellipsizes instead of
    // pushing the bar wider. Fill owns that role; Line makes it a single-line
    // strip whose <Text> leaf truncates.
    <WithTooltip content={`Current worktree: ${currentWorktree}`}>
      <Fill
        as="span"
        className="px-sm py-xs text-muted-foreground cursor-default"
      >
        <Line as="span" className="gap-xs">
          <StatusDot colorClass="bg-primary" />
          <Text as="span" variant="body">
            {taskTitle ?? currentWorktree}
          </Text>
        </Line>
      </Fill>
    </WithTooltip>
  );
}
