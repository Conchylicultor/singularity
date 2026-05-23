import { defineConfig } from "@plugins/config_v2/core";
import { intField, textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";
import { multilineTextField } from "@plugins/config_v2/plugins/fields/plugins/multiline-text/core";

export const promptTemplatesConfig = defineConfig({
  fields: {
    pinnedCount: intField({
      default: 5,
      label: "Pinned templates",
      description:
        "Number of templates shown as persistent chips in the prompt editor toolbar.",
    }),
    templates: listField({
      label: "Prompt Templates",
      description: "Templates that prepend text to the prompt editor.",
      itemFields: {
        title: textField({ label: "Title" }),
        prompt: multilineTextField({ label: "Prompt" }),
      },
      default: [],
    }),
  },
});
