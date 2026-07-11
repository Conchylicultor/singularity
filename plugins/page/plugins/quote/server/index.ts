import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Editor } from "@plugins/page/plugins/editor/server";
import { quoteBlock } from "../core";

export default {
  description:
    "Quote (blockquote) block type: registers its `data` schema at the server write boundary.",
  contributions: [Editor.BlockData(quoteBlock)],
} satisfies ServerPluginDefinition;
