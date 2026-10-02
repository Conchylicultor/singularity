import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { multilineTextField } from "@plugins/fields/plugins/multiline-text/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "./list";

/**
 * The list field's fixed gallery sample (see `FieldSample`). Items carry their
 * `id`, as a stored list item does once `normalizeCollectionItems` has run.
 */
export const listSample = fieldSample(
  listField({
    label: "Prompt templates",
    description: "Templates that prepend text to the prompt editor.",
    itemFields: {
      title: textField({ label: "Title" }),
      prompt: multilineTextField({ label: "Prompt" }),
    },
  }),
  [
    {
      id: "review-diff",
      title: "Review diff",
      prompt:
        "Review the current diff for correctness bugs; report findings ranked by severity.",
    },
    {
      id: "write-plan",
      title: "Write a plan",
      prompt:
        "Use the plan skill. Explore the codebase before proposing a design.",
    },
  ],
);
