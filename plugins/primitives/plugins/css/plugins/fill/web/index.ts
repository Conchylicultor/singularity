import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Fill, fillClasses, type FillProps, type FillAxis } from "./internal/fill";

export default {
  description:
    "Flexible-cell layout primitive: <Fill axis> is the single grow+shrink cell of a Line/Row (min-w-0 flex-1). The one home for the slack-absorbing, truncation-enabling cell, so a stray flex-1 never strands the grow slot.",
  contributions: [],
} satisfies PluginDefinition;
