import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { imageBlock } from "../core";
import { ImageBlock } from "./components/image-block";

export { imageBlock } from "../core";

export default {
  description:
    "Image block type: upload via paste/drop/picker into an empty block, free-width resize, served via attachments.",
  contributions: [
    Editor.Block({ match: imageBlock.type, block: imageBlock, component: ImageBlock }),
  ],
} satisfies PluginDefinition;
