import { ConversationsView } from "@plugins/conversations/plugins/conversations-view/web";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/sidebar-region/core";

/**
 * The `classic` sidebar variant: today's tabbed Queue/Grouped/History list,
 * rendered headerless (the launch button + variant picker now live in the
 * mount point's shared chrome). `h-full` fills the `<Column scrollBody={false}>`
 * body wrapper the mount point places it in, so the list scrolls internally and
 * the tab switcher stays rigid — same as before.
 */
export function ClassicBody(props: ConversationSidebarProps) {
  return <ConversationsView.Host {...props} className="h-full" />;
}
