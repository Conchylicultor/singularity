import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { Config } from "@plugins/config/web";
import { QuickPromptChips } from "./components/quick-prompt-chips";
import { QuickPromptsSettings } from "./components/quick-prompts-settings";

export default {
  id: "conversation-quick-prompts",
  name: "Conversation: Quick Prompts",
  description:
    "Named prompt chips in the conversation floating bar. Click to send a preset message to the active conversation.",
  contributions: [
    Conversation.AbovePromptInput({ component: QuickPromptChips }),
    Config.Section({
      id: "quick-prompts",
      title: "Quick Prompts",
      description:
        "Named prompts that appear as chips above the terminal. Click a chip to send the prompt to the conversation.",
      component: QuickPromptsSettings,
    }),
  ],
} satisfies PluginDefinition;
