import { CollapsibleWrap } from "@plugins/primitives/plugins/collapsible-wrap/web";
import { Conversation } from "../slots";

export function HeaderView() {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <CollapsibleWrap rows={1} gap={6}>
        <Conversation.Header.Render>
          {(item) => <item.component />}
        </Conversation.Header.Render>
      </CollapsibleWrap>
    </span>
  );
}
