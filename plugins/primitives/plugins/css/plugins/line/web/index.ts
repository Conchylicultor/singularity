import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Line, type LineProps } from "./internal/line";

export default {
  description:
    "Single-line container primitive: <Line> pairs the structural single-line invariant (region-line) with the ambient SingleLineProvider so children never wrap and <Text> leaves truncate. The bare line-container contract composed by Row/Bar and bespoke strips.",
  contributions: [],
} satisfies PluginDefinition;
