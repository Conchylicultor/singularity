import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useHoverReveal, hoverRevealClass } from "./internal/use-hover-reveal";

export default {
  description:
    "Hover/focus reveal for trailing affordances: useHoverReveal() + hoverRevealClass() couple opacity with pointer-events so a hidden control is never a live click-target (no invisible dead-zone over the blank space beside it).",
  contributions: [],
} satisfies PluginDefinition;
