import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PromptEditorSlots } from "@plugins/primitives/plugins/prompt-editor/web";
import { PushAndExitButton } from "./components/push-and-exit-button";

export default {
  name: "Conversation: Push & Exit",
  description:
    "Toolbar button that asks Claude to push the branch and close the conversation; surfaces Claude's flag if it has anything to raise.",
  contributions: [PromptEditorSlots.FloatingAction({ id: "push-and-exit", component: PushAndExitButton, alwaysActive: true })],
} satisfies PluginDefinition;
