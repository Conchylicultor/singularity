import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { colorField } from "./color";

/** The color field's fixed gallery sample (see `FieldSample`). */
export const colorSample = fieldSample(
  colorField({
    label: "Accent color",
    description: "Highlights the active tab and focused controls.",
  }),
  "#6366f1",
);
