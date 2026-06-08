import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useProfilingContext } from "@plugins/debug/plugins/profiling/web";
import { attemptPane } from "@plugins/attempt-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  PushGantt,
  type PushData,
} from "@plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web";
import { buildProfileDetailPane } from "@plugins/debug/plugins/profiling/plugins/build/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { pushDetailPane } from "../panes";
import { getPushProfiling } from "../../shared/endpoints";

export function PushSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const [data, setData] = useState<PushData | null>(null);
  const openPane = useOpenPane();

  const load = useCallback(async () => {
    try {
      setData(await fetchEndpoint(getPushProfiling, {}));
    } catch (err) {
      if (err instanceof TypeError) return;
      throw err;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!data || data.groups.length === 0) return null;

  return (
    <PushGantt
      groups={data.groups}
      totalMs={data.totalMs}
      onPushClick={(push) =>
        openPane(pushDetailPane, { pushId: push.pushId }, { mode: "push" })
      }
      onBuildClick={(build) => {
        if (!build.buildId) return;
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
