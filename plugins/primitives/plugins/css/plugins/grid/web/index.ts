import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Grid, type GridProps } from "./internal/grid";

export default {
  description:
    "Responsive/uniform grid layout primitive: <Grid minCellWidth> lays out a wrapping, equal-width card grid via a closed prop surface — not a raw grid-template passthrough.",
  contributions: [],
} satisfies PluginDefinition;
