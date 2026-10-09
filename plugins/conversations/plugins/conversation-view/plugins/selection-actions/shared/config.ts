import { defineConfig } from "@plugins/config_v2/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";

export const selectionAnswersConfig = defineConfig({
  fields: {
    pinnedCount: intField({
      default: 2,
      label: "Pinned quick answers",
      description:
        "Number of quick answers shown as chips in the selection toolbar; every one is in the panel that opens from its ✎.",
    }),
    answers: listField({
      label: "Selection quick answers",
      description:
        "Buttons shown when you select text in an agent's reply. The most-used ones are pinned as chips, the rest open from ✎. Each one quotes the selection: its name puts the quote and the prompt in the prompt field to edit, ➤ sends them right away.",
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
