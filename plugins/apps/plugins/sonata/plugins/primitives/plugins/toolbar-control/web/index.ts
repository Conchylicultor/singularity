import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ToolbarControl } from "./internal/toolbar-control";
export type { ToolbarControlProps } from "./internal/toolbar-control";
export { HoverExpandPanel, hoverExpandHost } from "./internal/hover-expand";

export default {
  description:
    "Shared chrome for Sonata's toolbar dial controls: a bordered pill with a leading muted category icon (with corner clearance), tooltip, and disabled dimming, wrapping caller-supplied segments; and the one hover-expand rule (hoverExpandHost + HoverExpandPanel) by which a collapsible toolbar control folds a part away at rest and opens it on hover, focus, press or hold. The jog wheels compose the pill; the volume control reuses the hover-expand rule.",
  contributions: [],
} satisfies PluginDefinition;
