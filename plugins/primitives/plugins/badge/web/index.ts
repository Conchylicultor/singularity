import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Badge,
  type BadgeProps,
  type BadgeVariant,
  type BadgeSize,
  type BadgeShape,
} from "./internal/badge";
export { formatStatusLabel } from "./internal/format-label";

export default {
  description:
    "The canonical chip primitive and shared chip shell (region-line single-line core, rigid leading icon, truncating label leaf): semantic variant × colorClass coloring, a rect|pill shape axis, size, and an optional monospace label. LinkChip and ToggleChip compose it.",
  contributions: [],
} satisfies PluginDefinition;
