import { defineConfig } from "@plugins/config_v2/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";

export const selectionAnswersConfig = defineConfig({
  fields: {
    answers: listField({
      label: "Selection quick answers",
      description:
        "Buttons shown when you select text in an agent's reply. Each one quotes the selection: its name puts the quote and the prompt in the prompt field to edit, ➤ sends them right away.",
      itemFields: {
        title: textField({ label: "Title" }),
        prompt: multilineTextField({ label: "Prompt" }),
      },
      default: [
        { title: "Go", prompt: "Go ahead with this." },
        {
          title: "Explain",
          prompt: "Explain this in more detail — what it means, and why.",
        },
      ],
    }),
  },
});
