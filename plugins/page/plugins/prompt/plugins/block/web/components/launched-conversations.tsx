import { useTaskConversations } from "@plugins/tasks/plugins/tasks-core/web";
import { ConversationChip } from "@plugins/conversations/plugins/conversation-ui/plugins/chip/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { useBlockPromptTasks } from "@plugins/page/plugins/prompt/plugins/link/web";

/**
 * The conversations this prompt block has launched, as a row of chips.
 *
 * Two reads, joined client-side: the link rows say WHICH tasks this block
 * launched, and `useTaskConversations` turns that set of tasks into their runs
 * off the already-boot-critical global `attempts` resource. Nothing is stored on
 * the block, so the row is correct after a reload and updates live as an agent's
 * status changes.
 *
 * Both halves are shared: the join is tasks-core's, the chip is
 * `ConversationChip`. This component owns only which tasks to ask about.
 *
 * Transient chrome (a handful of status chips beside a launch button), not a
 * homogeneous domain-record collection — hence `Cluster` + chips rather than a
 * DataView.
 */
export function LaunchedConversations({ blockId }: { blockId: string }) {
  const links = useBlockPromptTasks(blockId);
  const convs = useTaskConversations(links.map((link) => link.taskId));

  if (convs.pending || convs.data.length === 0) return null;

  return (
    <Cluster gap="xs">
      {convs.data.map((conv) => (
        <ConversationChip key={conv.id} conv={conv} />
      ))}
    </Cluster>
  );
}
