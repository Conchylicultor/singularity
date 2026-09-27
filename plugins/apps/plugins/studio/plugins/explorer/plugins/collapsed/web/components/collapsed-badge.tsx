import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const unfoldLessIcon = symbol("unfold-less");

export function CollapsedBadge({ node }: { node: PluginNode }) {
  if (!node.collapsed) return null;
  return (
    <Icon
      icon={unfoldLessIcon}
      className="size-3.5 text-info/90"
      aria-label="Collapsed sub-tree"
    />
  );
}
