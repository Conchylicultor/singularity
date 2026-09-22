import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import {
  DEFAULT_MODEL_CHOICE,
  SELECTABLE_CHOICES,
  choiceLabel,
} from "@plugins/conversations/plugins/model-provider/core";

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
          // A family ("Opus") runs its newest version at launch.
          options: SELECTABLE_CHOICES.map((value) => ({
            value,
            label: choiceLabel(value),
          })),
          default: DEFAULT_MODEL_CHOICE,
        }),
      },
      default: [],
    }),
  },
});
