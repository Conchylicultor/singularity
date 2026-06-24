import { useEffect, type ReactElement } from "react";
import { useProfilingContext } from "@plugins/debug/plugins/profiling/web";
import { attemptPane } from "@plugins/tasks/plugins/attempt-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ShellCommands } from "@plugins/shell/web";
import { PushGantt } from "@plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web";
import { buildProfileDetailPane } from "@plugins/debug/plugins/profiling/plugins/build/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { pushDetailPane } from "../panes";
import { getPushProfiling } from "../../shared/endpoints";

export function PushSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const { data, refetch } = useEndpoint(getPushProfiling, {});
  const openPane = useOpenPane();

  // refetch is not a state setter, so this effect is clean (no set-state-in-effect).
  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  if (!data || data.groups.length === 0) return null;

  return (
    <PushGantt
      groups={data.groups}
      totalMs={data.totalMs}
      onPushClick={(push) =>
        openPane(pushDetailPane, { pushId: push.pushId }, { mode: "push" })
      }
      onBuildClick={(build) => {
        if (!build.buildId) {
          ShellCommands.Toast({
            description: "No build profile for this build (logged before profiling).",
            variant: "info",
          });
          return;
        }
        openPane(
          buildProfileDetailPane,
          { worktree: build.worktree, buildId: build.buildId },
          { mode: "push" },
        );
      }}
      onWorktreeClick={(worktree, conversationId) => {
        if (conversationId != null) {
          openPane(
            conversationPane,
            { convId: conversationId },
            { mode: "push" },
          );
        } else {
          const attemptId = worktree.split("/").pop() ?? worktree;
          openPane(attemptPane, { attemptId }, { mode: "push" });
        }
      }}
    />
  );
}
