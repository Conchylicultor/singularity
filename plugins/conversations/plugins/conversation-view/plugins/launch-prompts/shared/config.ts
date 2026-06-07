import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";
import { enumField } from "@plugins/config_v2/plugins/fields/plugins/enum/core";
import { DEFAULT_MODEL, MODEL_REGISTRY, SELECTABLE_MODELS } from "@plugins/conversations/plugins/model-provider/core";

export const launchPromptsConfig = defineConfig({
  fields: {
    prompts: listField({
      label: "Launch Prompts",
      description:
        "Pre-configured prompts that launch a background conversation.",
      itemFields: {
        title: textField({ label: "Title" }),
        prompt: multilineTextField({ label: "Prompt" }),
        model: enumField({
          label: "Model",
          options: SELECTABLE_MODELS.map((value) => ({ value, label: MODEL_REGISTRY[value].label })),
          default: DEFAULT_MODEL,
        }),
      },
      default: [],
    }),
  },
});
