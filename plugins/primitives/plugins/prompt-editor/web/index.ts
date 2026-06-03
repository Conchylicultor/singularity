import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { PromptEditor } from "./components/prompt-editor";
export {
  PromptEditorSlots,
  type PromptEditorActionProps,
} from "./slots";

export default {
  name: "Prompt Editor",
  description:
    "Conversation-scoped prompt editor. Wraps the generic text-editor primitive and adds a FloatingAction slot for conversation-specific toolbar contributions (e.g. prompt templates).",
  contributions: [],
} satisfies PluginDefinition;
