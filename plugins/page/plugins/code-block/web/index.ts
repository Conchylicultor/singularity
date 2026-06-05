import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { codeBlock } from "../core";
import { CodeBlock } from "./components/code-block";

export { codeBlock } from "../core";

export default {
  name: "Code Block",
  description:
    "Code block type: editable with live syntax highlighting, language picker, and copy button.",
  contributions: [
    Editor.Block({ match: codeBlock.type, block: codeBlock, component: CodeBlock }),
  ],
} satisfies PluginDefinition;
