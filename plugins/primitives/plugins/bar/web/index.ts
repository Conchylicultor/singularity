import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Bar, type BarProps, type BarTier } from "./internal/bar";

export default {
  description:
    "Single-line chrome-strip primitive: the horizontal toolbar/header band (border-b + chrome height + inset, never-wrap via region-line) shared by app/pane toolbars and pane headers. Two tiers (chrome | pane); consumers compose it and own what they host.",
  contributions: [],
} satisfies PluginDefinition;
