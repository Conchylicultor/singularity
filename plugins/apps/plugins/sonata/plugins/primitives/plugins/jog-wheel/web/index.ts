import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { JogWheel } from "./internal/jog-wheel";
export type { JogWheelProps, JogWheelAria } from "./internal/jog-wheel";

export default {
  description:
    "Horizontal jog-wheel chrome: a bordered pill with a leading icon, a draggable ribbed 'physical wheel' face, and a right-hand readout. Consumers supply the value model + the inertial-drag handle.",
  contributions: [],
} satisfies PluginDefinition;
