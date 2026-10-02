import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { multilineTextField } from "./multiline-text";

/** The multiline-text field's fixed gallery sample (see `FieldSample`). */
export const multilineTextSample = fieldSample(
  multilineTextField({
    label: "System prompt",
    description: "Prepended to every new conversation.",
  }),
  "Be concise. Prefer the clean design over the hacky one.\nAsk before pushing.",
);
