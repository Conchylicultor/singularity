import { MdForum } from "react-icons/md";
import { SidebarPaneSection } from "@plugins/primitives/plugins/app-shell/web";
import { ConversationList } from "./conversation-list";
import { ConvCountLabel } from "./conv-count-label";

export function ConversationsSidebar() {
  return (
    <SidebarPaneSection
      title="Conversations"
      icon={MdForum}
      labelExtra={ConvCountLabel}
    >
      <ConversationList />
    </SidebarPaneSection>
  );
}
