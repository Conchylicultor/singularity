import { defineTabbedView } from "@plugins/primitives/plugins/tabbed-view/web";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/sidebar-region/core";

/**
 * The tab host for the `dataview` sidebar variant. Sub-plugins under
 * `data-view/plugins/*` contribute one `View` each (History, and — added
 * separately — Queue); {@link SidebarDataView.Host} renders the active tab
 * beneath the shared switcher chrome. Mirrors `ConversationsView` in
 * `conversations-view/web/slots.ts` (the classic variant's host).
 */
export const SidebarDataView = defineTabbedView<ConversationSidebarProps>(
  "conversations-sidebar-dataview",
);
