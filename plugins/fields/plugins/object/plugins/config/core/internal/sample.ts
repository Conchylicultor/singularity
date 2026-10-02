import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { objectField } from "./object";

/** The object field's fixed gallery sample (see `FieldSample`). */
export const objectSample = fieldSample(
  objectField({
    label: "Default window size",
    description: "Size of a newly opened floating window.",
    subFields: {
      width: intField({ label: "Width" }),
      height: intField({ label: "Height" }),
    },
  }),
  { width: 960, height: 640 },
);
