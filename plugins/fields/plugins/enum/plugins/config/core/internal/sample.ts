import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { enumField } from "./enum";

/** The enum field's fixed gallery sample (see `FieldSample`). */
export const enumSample = fieldSample(
  enumField({
    label: "Density",
    description: "Spacing between rows in lists.",
    options: [
      { value: "compact", label: "Compact" },
      { value: "comfortable", label: "Comfortable" },
      { value: "spacious", label: "Spacious" },
    ],
  }),
  "comfortable",
);
