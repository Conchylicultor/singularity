import { MdBolt } from "react-icons/md";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

export function LoadBearingBadge({ node }: { node: PluginNode }) {
  if (!node.loadBearing) return null;
  return (
    <MdBolt
      className="size-3.5 text-warning"
      aria-label="Load-bearing"
    />
  );
}
