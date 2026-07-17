import type { MouseEvent } from "react";
import { defineTabbedView } from "@plugins/primitives/plugins/tabbed-view/web";

/**
 * The props every conversation-sidebar tab receives. Owned by this umbrella —
 * the mount point (`conversations-view`) renders {@link SidebarDataView.Host}
 * directly and passes these, and each tab sub-plugin (Queue / History)
 * consumes the same shape. Formerly lived in the deleted `sidebar-region` plugin
 * (its `ConversationSidebarProps`), moved here so the sidebar renders entirely
 * through the DataView primitive with no back-edge into `conversations-view`.
 */
export interface ConversationSidebarProps {
  activeId: string | null;
  onNavigate: (id: string) => void;
  onCloseConversation: (id: string, e: MouseEvent) => Promise<void>;
}

/**
 * The tab host for the DataView conversation sidebar. Sub-plugins under
 * `data-view/plugins/*` contribute one `View` each (Queue, History);
 * {@link SidebarDataView.Host} renders the active tab beneath the shared switcher
 * chrome, mounted directly by the `conversations-view` mount point.
 */
export const SidebarDataView = defineTabbedView<ConversationSidebarProps>(
  "conversations-sidebar-dataview",
);
