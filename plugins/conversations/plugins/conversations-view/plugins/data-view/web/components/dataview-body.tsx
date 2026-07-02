import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/sidebar-region/core";
import { SidebarDataView } from "../host";

/**
 * The `dataview` sidebar variant body: the tabbed DataView host, rendered
 * headerless (the launch button + variant picker live in the mount point's
 * shared chrome). `h-full` fills the `<Column scrollBody={false}>` body wrapper
 * the mount point places it in. Mirrors `ClassicBody` in the `classic` variant.
 */
export function DataViewBody(props: ConversationSidebarProps) {
  return <SidebarDataView.Host {...props} className="h-full" />;
}
