import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReorderNodes } from "@plugins/reorder/plugins/node-types/web";
import { dividerNodeType } from "./internal/node-type";

export default {
  description:
    "Divider reorder node type: a hairline rule between stacked slot items (leaf), with an 'Add Divider' insert affordance.",
  contributions: [ReorderNodes.NodeType({ nodeType: dividerNodeType })],
} satisfies PluginDefinition;
