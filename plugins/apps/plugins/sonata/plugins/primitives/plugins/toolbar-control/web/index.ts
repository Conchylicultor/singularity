import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ToolbarControl } from "./internal/toolbar-control";
export type { ToolbarControlProps } from "./internal/toolbar-control";

export default {
  description:
    "Shared chrome for Sonata's toolbar dial controls: a bordered pill with a leading muted category icon (with corner clearance), tooltip, and disabled dimming, wrapping caller-supplied segments. Composed by the jog wheels and the transpose stepper.",
  contributions: [],
} satisfies PluginDefinition;
