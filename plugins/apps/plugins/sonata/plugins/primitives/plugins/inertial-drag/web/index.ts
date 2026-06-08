import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useInertialDrag } from "./internal/use-inertial-drag";
export type {
  InertialDragConfig,
  InertialDragHandle,
} from "./internal/use-inertial-drag";

export default {
  name: "Inertial Drag",
  description:
    "1-D pointer drag-to-scrub hook with exponential-friction release momentum (flick → coast → settle).",
  contributions: [],
} satisfies PluginDefinition;
