import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";
import { multilineTextField } from "@plugins/config_v2/plugins/fields/plugins/multiline-text/core";

// Library of named preprompts. Each item's text is appended to the Claude
// system prompt via `--append-system-prompt` when a task that selects it
// launches an agent. Mirrors the prompt-templates config (a listField of
// { title, prompt }), but feeds the launch instead of the prompt editor.
export const prepromptsConfig = defineConfig({
  fields: {
    preprompts: listField({
      label: "Preprompts",
      description:
        "System-prompt snippets appended to a task's agent via --append-system-prompt.",
      itemFields: {
        title: textField({ label: "Title" }),
        prompt: multilineTextField({ label: "Prompt" }),
      },
      default: [],
    }),
  },
});
