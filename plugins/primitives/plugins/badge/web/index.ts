import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Badge,
  type BadgeProps,
  type BadgeVariant,
  type BadgeSize,
} from "./internal/badge";

export default {
  name: "Badge",
  description:
    "Semantic badge primitive: size × variant chip with a colorClass escape hatch, optional leading icon, and a single theme-derived radius.",
  contributions: [],
} satisfies PluginDefinition;
