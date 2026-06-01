import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";
import { multilineTextField } from "@plugins/config_v2/plugins/fields/plugins/multiline-text/core";
import { enumField } from "@plugins/config_v2/plugins/fields/plugins/enum/core";
import { DEFAULT_MODEL, MODEL_REGISTRY } from "@plugins/conversations/plugins/model-provider/core";

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
          options: Object.entries(MODEL_REGISTRY).map(([value, m]) => ({ value, label: m.label })),
          default: DEFAULT_MODEL,
        }),
      },
      default: [],
    }),
  },
});
