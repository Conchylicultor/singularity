import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { stringListField } from "./string-list";

/** The string-list field's fixed gallery sample (see `FieldSample`). */
export const stringListSample = fieldSample(
  stringListField({
    label: "Ignored paths",
    description: "Glob patterns the file watcher skips.",
  }),
  ["node_modules/**", "dist/**", "*.log"],
);
