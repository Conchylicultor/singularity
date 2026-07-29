import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { attemptsResource } from "@plugins/tasks/plugins/tasks-core/core";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { useBlockPromptTasks } from "@plugins/page/plugins/prompt/plugins/link/web";

/**
 * The conversations this prompt block has launched, as a row of chips.
 *
 * Two reads, joined client-side: the link rows say WHICH tasks this block
 * launched, and the already-boot-critical global `attempts` resource carries
 * each task's attempts with their conversation summaries. That is the same read
 * `task-events` performs — no new resource, and nothing is stored on the block,
 * so the row is correct after a reload and updates live as an agent's status
 * changes.
 *
 * Transient chrome (a handful of status chips beside a launch button), not a
 * homogeneous domain-record collection — hence `Cluster` + chips rather than a
 * DataView.
 */
export function LaunchedConversations({ blockId }: { blockId: string }) {
  const links = useBlockPromptTasks(blockId);
  const attemptsQ = useResource(attemptsResource);
  const openPane = useOpenPane();
  // The conversation column this block opened, if one is currently in the route.
  // Pages mounts Miller columns, so a conversation pane in the chain is by
  // definition one opened from a page — take the last (rightmost) one.
  const activeConvId = conversationPane.useRouteEntries().at(-1)?.params.convId;

  if (attemptsQ.pending || links.length === 0) return null;

  const taskIds = new Set(links.map((link) => link.taskId));
  const convs = attemptsQ.data
    .filter((attempt) => taskIds.has(attempt.taskId))
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .flatMap((attempt) => attempt.conversations);

  if (convs.length === 0) return null;

  return (
    <Cluster gap="xs">
      {convs.map((conv) => (
        <ToggleChip
          key={conv.id}
          variant="ghost"
          active={activeConvId === conv.id}
          title={conv.title ?? "Starting…"}
          onClick={() =>
            openPane(conversationPane, { convId: conv.id }, { mode: "push" })
          }
        >
          <ConversationItem conv={conv} layout="inline" />
        </ToggleChip>
      ))}
    </Cluster>
  );
}
