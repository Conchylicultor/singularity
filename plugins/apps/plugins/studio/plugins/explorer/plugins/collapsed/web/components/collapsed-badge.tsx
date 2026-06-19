import { MdUnfoldLess } from "react-icons/md";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

export function CollapsedBadge({ node }: { node: PluginNode }) {
  if (!node.collapsed) return null;
  return (
    <MdUnfoldLess
      className="size-3.5 text-info/90"
      aria-label="Collapsed sub-tree"
    />
  );
}
