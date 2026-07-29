import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { promptBlock } from "../core";
import { PromptBlock } from "./components/prompt-block";

export { promptBlock } from "../core";

export default {
  description:
    "Prompt block type: block text plus a launch control that turns it into an agent run, and chips for the conversations it launched.",
  contributions: [
    Editor.Block({ id: promptBlock.type, match: promptBlock.type, block: promptBlock, component: PromptBlock }),
  ],
} satisfies PluginDefinition;
