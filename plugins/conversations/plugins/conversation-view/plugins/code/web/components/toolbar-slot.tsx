import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { Code } from "../slots";

export function CodeToolbarSlot({ conversation }: { conversation: ConversationState }) {
  const items = Code.ToolbarButton.useContributions();
  return (
    <>
      {items.map((item, idx) => {
        const Component = item.component;
        return <Component key={idx} conversation={conversation} />;
      })}
    </>
  );
}
