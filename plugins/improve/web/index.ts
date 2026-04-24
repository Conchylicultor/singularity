import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { Config } from "@plugins/config/web";
import { ImproveButton } from "./components/improve-button";
import { PromptTemplateSettings } from "./components/prompt-template-settings";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button for app-improvement feedback. Files a task under "Improvements" with URL + optional screenshot.',
  contributions: [
    Shell.Toolbar({
      component: ImproveButton,
      group: "actions",
    }),
    Config.Section({
      id: "prompt-template",
      title: "Improve prompt template",
      description:
        "Prompt used when launching an agent from the Improve button. Supports {{text}}, {{url}}, and {{attachments}} placeholders.",
      component: PromptTemplateSettings,
    }),
  ],
} satisfies PluginDefinition;
