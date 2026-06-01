import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  useLastAssistantEvent,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";

export function ForkSessionAction({ event }: { event: JsonlEvent }) {
  const lastAssistant = useLastAssistantEvent();
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);

  if (event !== lastAssistant || !conversation?.claudeSessionId) return null;

  return (
    <LaunchControl
      size="icon"
      getRequest={() => ({ forkFromConversationId: convId })}
    />
  );
}
