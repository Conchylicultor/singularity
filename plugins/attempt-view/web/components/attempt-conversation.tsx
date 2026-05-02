import {
  ConversationProvide,
  ConversationView,
} from "@plugins/conversations/plugins/conversation-view/web";
import { attemptConversationPane } from "../panes";

export function AttemptConversationBody() {
  const { convId } = attemptConversationPane.useParams();
  return (
    <ConversationProvide key={convId} convId={convId}>
      <ConversationView />
    </ConversationProvide>
  );
}
