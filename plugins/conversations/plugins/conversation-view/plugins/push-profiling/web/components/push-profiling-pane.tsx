import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { attemptPane } from "@plugins/tasks/plugins/attempt-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { OpGantt } from "@plugins/debug/plugins/profiling/plugins/push/plugins/push-gantt/web";
import {
  getOpProfiling,
  useOpClick,
} from "@plugins/debug/plugins/profiling/plugins/push/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function PushProfilingPaneBody() {
  const convId = conversationPane.useRouteEntry()?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const attemptId = conversation?.attemptId;

  const openPane = useOpenPane();
  const onOpClick = useOpClick();

  const { data } = useEndpoint(
    getOpProfiling,
    {},
    { query: { worktree: attemptId }, enabled: !!attemptId },
  );

  if (!attemptId) return null;

  if (!data || data.groups.length === 0) {
    return (
      <Text as="div" variant="body" className="p-lg text-muted-foreground">
        No build, push, or check activity for this conversation.
      </Text>
    );
  }

  return (
    <OpGantt
      groups={data.groups}
      totalMs={data.totalMs}
      highlightWorktree={attemptId}
      onOpClick={onOpClick}
      onWorktreeClick={(worktree, conversationId) => {
        if (conversationId != null) {
          openPane(conversationPane, { convId: conversationId }, { mode: "push" });
        } else {
          const id = worktree.split("/").pop() ?? worktree;
          openPane(attemptPane, { attemptId: id }, { mode: "push" });
        }
      }}
    />
  );
}
