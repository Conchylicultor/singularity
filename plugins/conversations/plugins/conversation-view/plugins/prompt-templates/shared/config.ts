import { defineConfig } from "@plugins/config_v2/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";

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
