import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Badge,
  type BadgeProps,
  type BadgeVariant,
  type BadgeShape,
} from "./internal/badge";
export { formatStatusLabel } from "./internal/format-label";

export default {
  description:
    "The canonical chip primitive and shared chip shell (region-line single-line core, rigid leading icon, truncating label leaf): semantic variant × colorClass coloring, a rect|pill shape axis, size, and an optional monospace label. The label is the chip's baseline, so a chip dropped in a sentence sits on the same line as the words beside it instead of on its icon's bottom edge. LinkChip and ToggleChip compose it.",
  contributions: [],
} satisfies PluginDefinition;
