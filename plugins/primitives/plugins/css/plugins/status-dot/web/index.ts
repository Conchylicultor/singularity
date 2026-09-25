import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  StatusDot,
  statusDotPaintClass,
  type StatusDotProps,
  type StatusDotPaint,
} from "./internal/status-dot";

export default {
  description:
    "Status-indicator dot primitive: a rounded inline-block span painted either FILLED (colorClass) or as a HOLLOW 1px ring (ringClass), so an empty dot keeps its size in running text as well as in a flex row. Its diameter follows the ambient ControlSize through the density group's status-dot tokens (defaults: xs 4px, sm 6px, md 8px, lg 10px).",
  contributions: [],
} satisfies PluginDefinition;
