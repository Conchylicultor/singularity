import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReorderNodes } from "@plugins/reorder/plugins/node-types/web";
import { overflowNodeType } from "./internal/node-type";

export default {
  description:
    "Overflow reorder node type: a container whose members collapse behind one ⋯ dropdown and render as labelled menu rows (via action-presentation). In edit mode it is a labelled inline box so the bucket stays draggable. Owns the label payload schema.",
  contributions: [ReorderNodes.NodeType({ nodeType: overflowNodeType })],
} satisfies PluginDefinition;
