import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { embedBlock } from "../core";
import { EmbedBlock } from "./components/embed-block";

export { embedBlock, EMBED_TYPE } from "../core";

export default {
  description:
    "Embed block type: render an external URL (YouTube, Vimeo, …) in a sandboxed iframe.",
  contributions: [
    Editor.Block({ match: embedBlock.type, block: embedBlock, component: EmbedBlock }),
  ],
} satisfies PluginDefinition;
