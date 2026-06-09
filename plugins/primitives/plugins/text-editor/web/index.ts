import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { TextEditor } from "./components/text-editor";
export {
  TextEditorSlots,
  type TextEditorPluginProps,
} from "./slots";
export { registerNodeExtension, type NodeExtension } from "./internal/node-extensions";

export default {
  description:
    "Generic Lexical-based rich text editor primitive. Plugins inject behaviors via the Plugin slot and registerNodeExtension.",
  contributions: [],
} satisfies PluginDefinition;
