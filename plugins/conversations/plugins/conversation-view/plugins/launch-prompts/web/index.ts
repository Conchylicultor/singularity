import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { Config } from "@plugins/config/web";
import { LaunchPromptsButton } from "./components/launch-prompts-button";
import { LaunchPromptsSettings } from "./components/launch-prompts-settings";

export default {
  id: "conversation-launch-prompts",
  name: "Conversation: Launch Prompts",
  description:
    "Pre-configured prompts that launch a new background conversation in the same worktree.",
  contributions: [
    Conversation.PromptBar({ id: "launch-prompts", component: LaunchPromptsButton, section: "Launch", sectionOrder: 2 }),
    Config.Section({
      id: "launch-prompts",
      title: "Launch Prompts",
      description:
        "Prompts that launch a new background conversation in the same worktree when clicked from the bottom bar.",
      component: LaunchPromptsSettings,
    }),
  ],
} satisfies PluginDefinition;
