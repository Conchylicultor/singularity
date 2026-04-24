import { ConversationView } from "@plugins/conversations/plugins/conversation-view/web";
import { attemptConversationPane } from "../panes";

export function AttemptConversationBody() {
  const { convId } = attemptConversationPane.useParams();
  return <ConversationView key={convId} sessionId={convId} />;
}
