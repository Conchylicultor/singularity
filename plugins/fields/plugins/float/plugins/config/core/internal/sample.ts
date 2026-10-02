import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { floatField } from "./float";

/** The float field's fixed gallery sample (see `FieldSample`). */
export const floatSample = fieldSample(
  floatField({
    label: "Playback speed",
    description: "Multiplier applied to audio playback.",
    min: 0.25,
    max: 4,
    step: 0.25,
  }),
  1.5,
);
