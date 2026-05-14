import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { PromptEditor } from "./components/prompt-editor";
export {
  PromptEditorSlots,
  type PromptEditorActionProps,
  type PromptEditorPluginProps,
} from "./slots";
export { registerNodeExtension, type NodeExtension } from "./internal/node-extensions";

export default {
  id: "prompt-editor",
  name: "Prompt Editor",
  description:
    "Lexical-based prompt editor primitive. An extensible shell where plugins inject features (image paste, templates, etc.) via the Plugin slot and registerNodeExtension.",
  contributions: [],
} satisfies PluginDefinition;
