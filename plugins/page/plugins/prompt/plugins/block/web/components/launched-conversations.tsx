import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { attemptsResource } from "@plugins/tasks/plugins/tasks-core/core";
import { ConversationChip } from "@plugins/conversations/plugins/conversation-ui/plugins/chip/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
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
 * The chip itself is `ConversationChip` — the shared "a conversation, clickable,
 * opening its run" widget. This component owns only the join and the order.
 *
 * Transient chrome (a handful of status chips beside a launch button), not a
 * homogeneous domain-record collection — hence `Cluster` + chips rather than a
 * DataView.
 */
export function LaunchedConversations({ blockId }: { blockId: string }) {
  const links = useBlockPromptTasks(blockId);
  const attemptsQ = useResource(attemptsResource);

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
        <ConversationChip key={conv.id} conv={conv} />
      ))}
    </Cluster>
  );
}
