import { MdRocketLaunch } from "react-icons/md";
import { PaneIconAction } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import {
  asNamespace,
  namespaceUrl,
} from "@plugins/infra/plugins/namespace/core";

export function OpenAppButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <PaneIconAction
      label="Open app"
      icon={MdRocketLaunch}
      onClick={() =>
        // An attempt id IS its worktree checkout name, and the main
        // composition's prefix elides — so the attempt id is the namespace.
        window.open(
          namespaceUrl(asNamespace(conversation.attemptId), "/"),
          "_blank",
        )
      }
    />
  );
}
