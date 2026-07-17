import { useEffect, type ReactElement } from "react";
import { useProfilingContext } from "@plugins/debug/plugins/profiling/web";
import { attemptPane } from "@plugins/tasks/plugins/attempt-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { OpGantt } from "@plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpClick } from "../internal/use-op-click";
import { getOpProfiling } from "../../shared/endpoints";

export function OpSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const { data, refetch } = useEndpoint(getOpProfiling, {});
  const openPane = useOpenPane();
  const onOpClick = useOpClick();

  // refetch is not a state setter, so this effect is clean (no set-state-in-effect).
  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  if (!data || data.groups.length === 0) return null;

  return (
    <OpGantt
      groups={data.groups}
      totalMs={data.totalMs}
      onOpClick={onOpClick}
      onWorktreeClick={(worktree, conversationId) => {
        if (conversationId != null) {
          openPane(conversationPane, { convId: conversationId }, { mode: "push" });
        } else {
          const attemptId = worktree.split("/").pop() ?? worktree;
          openPane(attemptPane, { attemptId }, { mode: "push" });
        }
      }}
    />
  );
}
