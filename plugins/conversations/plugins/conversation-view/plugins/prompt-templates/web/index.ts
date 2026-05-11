import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { Config } from "@plugins/config/web";
import { PromptTemplateChips } from "./components/prompt-template-chips";
import { PromptTemplatesSettings } from "./components/prompt-templates-settings";

export default {
  id: "conversation-prompt-templates",
  name: "Conversation: Prompt Templates",
  description:
    "Template chips above the prompt input that prepend text to the editor draft for editing before sending.",
  contributions: [
    Conversation.AbovePromptInput({ id: "prompt-templates", component: PromptTemplateChips }),
    Config.Section({
      id: "prompt-templates",
      title: "Prompt Templates",
      description:
        "Named templates that appear as chips above the prompt input. Click a chip to prepend its text to your current draft.",
      component: PromptTemplatesSettings,
    }),
  ],
} satisfies PluginDefinition;
