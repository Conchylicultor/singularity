import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { fileBlock } from "../core";
import { FileBlock } from "./components/file-block";
import "./internal/register";

export { fileBlock, FILE_TYPE } from "../core";

export default {
  description:
    "File block type: attach any file as a downloadable card; served via attachments.",
  contributions: [
    Editor.Block({ id: fileBlock.type, match: fileBlock.type, block: fileBlock, component: FileBlock }),
  ],
} satisfies PluginDefinition;
