import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { StatusDot, type StatusDotProps } from "./internal/status-dot";

export default {
  id: "status-dot",
  name: "Status Dot",
  description:
    "Colored status-indicator dot primitive. Composes a fixed-size rounded span with a caller-supplied Tailwind color class. Size variants: sm (size-1.5), md (size-2), lg (size-2.5).",
  contributions: [],
} satisfies PluginDefinition;
