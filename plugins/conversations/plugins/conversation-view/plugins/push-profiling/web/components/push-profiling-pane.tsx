import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { attemptPane } from "@plugins/tasks/plugins/attempt-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { PushGantt } from "@plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web";
import { pushDetailPane, getPushProfiling } from "@plugins/debug/plugins/profiling/plugins/push/web";
import { buildProfileDetailPane } from "@plugins/debug/plugins/profiling/plugins/build/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { convPushProfilingPane } from "../panes";

export function PushProfilingPaneBody() {
  const { convId: inputConvId } = convPushProfilingPane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const attemptId = conversation?.attemptId;

  const openPane = useOpenPane();

  const { data } = useEndpoint(
    getPushProfiling,
    {},
    { query: { worktree: attemptId }, enabled: !!attemptId },
  );

  if (!attemptId) return null;

  if (!data || data.groups.length === 0) {
    return (
      <Text as="div" variant="body" className="p-lg text-muted-foreground">
        No push or build activity for this conversation.
      </Text>
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
        if (!build.buildId) {
          showToast({
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
          const id = worktree.split("/").pop() ?? worktree;
          openPane(attemptPane, { attemptId: id }, { mode: "push" });
        }
      }}
    />
  );
}
