import { useCallback, useEffect, useState } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { attemptPane } from "@plugins/attempt-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  PushGantt,
  type PushData,
} from "@plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web";
import { pushDetailPane } from "@plugins/debug/plugins/profiling/plugins/push/web";
import { buildProfileDetailPane } from "@plugins/debug/plugins/profiling/plugins/build/web";
import { convPushProfilingPane } from "../panes";

const PUSH_PROFILING_PATH = "/api/debug/profiling/push";

export function PushProfilingPaneBody() {
  const { convId: inputConvId } = convPushProfilingPane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const attemptId = conversation?.attemptId;

  const [data, setData] = useState<PushData | null>(null);
  const openPane = useOpenPane();

  const load = useCallback(async () => {
    if (!attemptId) return;
    try {
      const params = new URLSearchParams({ worktree: attemptId });
      const url = `${PUSH_PROFILING_PATH}?${params}`;
      const res = await fetch(url);
      if (!res.ok) return;
      setData((await res.json()) as PushData);
    } catch (err) {
      if (err instanceof TypeError) return;
      throw err;
    }
  }, [attemptId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!attemptId) return null;

  if (!data || data.groups.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No push or build activity for this conversation.
      </div>
    );
  }

  return (
    <PushGantt
      groups={data.groups}
      totalMs={data.totalMs}
      highlightWorktree={attemptId}
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
          const id = worktree.split("/").pop() ?? worktree;
          openPane(attemptPane, { attemptId: id }, { mode: "push" });
        }
      }}
    />
  );
}
