import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { attemptPane } from "@plugins/tasks/plugins/attempt-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { OpGantt } from "@plugins/debug/plugins/profiling/plugins/ops/plugins/op-gantt/web";
import {
  getOpProfiling,
  useOpClick,
} from "@plugins/debug/plugins/profiling/plugins/ops/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { OP_KINDS, OP_KIND_IDS } from "@plugins/infra/plugins/worktree/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

// The empty state names every kind of op this Gantt can show. Read off the
// `OP_KINDS` declaration rather than written out, so a kind added there is named
// here too — the hand-kept list said "build, push, or check" long after `test`
// and `e2e` joined.
const OP_KIND_LIST = new Intl.ListFormat("en", {
  type: "disjunction",
}).format(OP_KIND_IDS.map((id) => OP_KINDS[id].label.toLowerCase()));

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
        No {OP_KIND_LIST} activity for this conversation.
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
