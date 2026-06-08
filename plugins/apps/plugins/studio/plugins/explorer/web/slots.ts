import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

export interface TreeRowBadgeContribution {
  id: string;
  component: ComponentType<{ node: PluginNode }>;
}

export const Explorer = {
  TreeRowBadge: defineRenderSlot<TreeRowBadgeContribution>(
    "studio.explorer.tree-row-badge",
    { docLabel: (p) => p.id },
  ),
};
