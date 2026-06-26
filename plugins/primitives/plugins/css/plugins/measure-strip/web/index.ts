import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { MeasureStrip, type MeasureStripProps } from "./internal/measure-strip";

export default {
  description:
    "Off-screen body-portaled measurement strip: a hidden flex row for measuring children's natural widths before an overflow/collapse decision.",
  contributions: [],
} satisfies PluginDefinition;
