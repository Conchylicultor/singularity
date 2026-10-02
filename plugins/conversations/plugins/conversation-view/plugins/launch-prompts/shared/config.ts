import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";
import { DEFAULT_MODEL_CHOICE } from "@plugins/conversations/plugins/model-provider/core";

export const launchPromptsConfig = defineConfig({
  fields: {
    prompts: listField({
      label: "Launch Prompts",
      description:
        "Pre-configured prompts that launch a background conversation.",
      itemFields: {
        title: textField({ label: "Title" }),
        prompt: multilineTextField({ label: "Prompt" }),
        // A family ("Opus") runs its newest version at launch. The options are
        // the live model catalog's (contributed by this plugin's web barrel),
        // so the config lists no model; the launch reads it back through
        // `normalizeModelChoice`.
        model: dynamicEnumField({
          label: "Model",
          default: DEFAULT_MODEL_CHOICE,
        }),
      },
      default: [],
    }),
  },
});
