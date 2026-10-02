import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { intField } from "./int";

/** The int field's fixed gallery sample (see `FieldSample`). */
export const intSample = fieldSample(
  intField({
    label: "Max parallel agents",
    description: "Agents that may run at the same time.",
    min: 1,
    max: 16,
  }),
  4,
);
