import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";
import { avatarField } from "@plugins/config_v2/plugins/fields/plugins/avatar/core";

// Library of named preprompts. Each item's text is prepended to the agent's
// first user turn (wrapped in a `<special_instructions>` block) when a task
// that selects it launches an agent. Mirrors the prompt-templates config (a
// listField of { title, prompt }), but feeds the launch instead of the prompt
// editor.
export const prepromptsConfig = defineConfig({
  fields: {
    preprompts: listField({
      label: "Preprompts",
      description:
        "Instruction snippets prepended to a task's agent first user turn as a <special_instructions> block.",
      itemFields: {
        icon: avatarField({
          label: "Icon",
          description:
            "Shown as a marker on conversations launched with this preprompt.",
        }),
        title: textField({ label: "Title" }),
        prompt: multilineTextField({ label: "Prompt" }),
      },
      default: [],
    }),
  },
});
