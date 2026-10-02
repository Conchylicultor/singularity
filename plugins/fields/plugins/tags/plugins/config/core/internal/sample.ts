import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { tagsField } from "./tags";

/** The tags field's fixed gallery sample (see `FieldSample`). */
export const tagsSample = fieldSample(
  tagsField({
    label: "Languages",
    description: "Languages highlighted in code blocks.",
    options: [
      { value: "typescript", label: "TypeScript" },
      { value: "python", label: "Python" },
      { value: "go", label: "Go" },
      { value: "rust", label: "Rust" },
    ],
  }),
  ["typescript", "go"],
);
