import type { PluginDefinition } from "@core";
import { PromptEditorSlots } from "@plugins/primitives/plugins/paste-images/web";
import { Config } from "@plugins/config/web";
import { FloatingTemplateChips } from "./components/prompt-template-chips";
import { PromptTemplatesSettings } from "./components/prompt-templates-settings";

export default {
  id: "conversation-prompt-templates",
  name: "Conversation: Prompt Templates",
  description:
    "Template chips inside the prompt editor that prepend text to the draft. A floating icon expands on hover to reveal available templates.",
  contributions: [
    PromptEditorSlots.FloatingAction({
      id: "prompt-templates",
      component: FloatingTemplateChips,
    }),
    Config.Section({
      id: "prompt-templates",
      title: "Prompt Templates",
      description:
        "Named templates that appear as chips inside the prompt editor. Click a chip to prepend its text to your current draft.",
      component: PromptTemplatesSettings,
    }),
  ],
} satisfies PluginDefinition;
