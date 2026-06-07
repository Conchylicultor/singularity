import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

export const autoAnswerConfig = defineConfig({
  name: "auto-answer",
  fields: {
    enabled: boolField({
      default: false,
      label: "Auto-open question prompts",
      description:
        'When an agent asks a question, automatically dismiss the terminal menu and surface the inline answer form in the conversation — no need to click "Answer here" first. You still type the answer yourself.',
    }),
  },
});
