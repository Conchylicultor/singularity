import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { HeaderChip } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { TRACK_META } from "@plugins/tasks/plugins/task-track/core";
import { useTaskTrack } from "@plugins/tasks/plugins/task-track/web";

/** The conversation's task track as a header chip ("Main" / "Sidequest"). */
export function TrackChip() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return <TaskTrackChip taskId={conversation.taskId} />;
}

function TaskTrackChip({ taskId }: { taskId: string }) {
  const result = useTaskTrack(taskId);
  // Not known yet: the loading block, never a "Main" that might flip.
  if (result.pending) return <Loading variant="block" className="h-5 w-16" />;
  const meta = TRACK_META[result.track];
  return <HeaderChip colorClass={meta.chipClass}>{meta.label}</HeaderChip>;
}
