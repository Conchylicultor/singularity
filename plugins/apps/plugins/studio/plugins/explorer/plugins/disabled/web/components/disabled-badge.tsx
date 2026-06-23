import { MdBlock } from "react-icons/md";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

export function DisabledBadge({ node }: { node: PluginNode }) {
  if (!node.disabled) return null;
  const label = node.disabledSeed ? "Disabled" : "Disabled (cascade)";
  return (
    <MdBlock
      className="size-3.5 text-muted-foreground"
      aria-label={label}
    />
  );
}
