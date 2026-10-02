import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { textField } from "./text";

/** The text field's fixed gallery sample (see `FieldSample`). */
export const textSample = fieldSample(
  textField({
    label: "Display name",
    description: "Shown in the sidebar and on shared pages.",
  }),
  "Ada Lovelace",
);
