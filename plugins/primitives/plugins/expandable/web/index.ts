import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Expandable } from "./internal/expandable";
export type { ExpandableProps } from "./internal/expandable";

export default {
  description:
    "Clamps tall content to a max height and reveals a Show more/less toggle only when the rendered content actually overflows (measured via ResizeObserver, not char/line heuristics).",
  contributions: [],
} satisfies PluginDefinition;
