import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Editor } from "@plugins/page/plugins/editor/server";
import { mapBlock } from "../core";

export default {
  description:
    "Map block type: registers its (empty) `data` schema at the server write boundary.",
  contributions: [Editor.BlockData(mapBlock)],
} satisfies ServerPluginDefinition;
