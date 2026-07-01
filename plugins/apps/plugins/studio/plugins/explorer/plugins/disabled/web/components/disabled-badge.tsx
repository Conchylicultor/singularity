import { MdBlock } from "react-icons/md";
import {
  useEnsureCompositionData,
  useDisabledClosure,
} from "@plugins/plugin-meta/plugins/composition/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

export function DisabledBadge({ node }: { node: PluginNode }) {
  useEnsureCompositionData();
  const disabled = useDisabledClosure();
  const inClosure = node.disabledSeed || (disabled?.has(node.id) ?? false);
  if (!inClosure) return null;
  const label = node.disabledSeed ? "Disabled" : "Disabled (cascade)";
  return <MdBlock className="size-3.5 text-muted-foreground" aria-label={label} />;
}
