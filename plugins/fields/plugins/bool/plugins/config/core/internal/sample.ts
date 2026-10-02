import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { boolField } from "./bool";

/** The bool field's fixed gallery sample (see `FieldSample`). */
export const boolSample = fieldSample(
  boolField({
    label: "Show line numbers",
    description: "Number every line in code blocks.",
  }),
  true,
);
