import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const boltIcon = symbol("bolt");

export function LoadBearingBadge({ node }: { node: PluginNode }) {
  if (!node.loadBearing) return null;
  return (
    <Icon
      icon={boltIcon}
      className="size-3.5 text-warning"
      aria-label="Load-bearing"
    />
  );
}
