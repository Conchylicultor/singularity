import { ConversationView } from "@plugins/conversations/plugins/conversation-view/web";
import { yakShavingConversationPane } from "../panes";

export function YakShavingConversationBody() {
  const { convId } = yakShavingConversationPane.useParams();
  return <ConversationView key={convId} sessionId={convId} />;
}
