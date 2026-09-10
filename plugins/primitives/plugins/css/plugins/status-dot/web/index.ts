import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { StatusDot, type StatusDotProps } from "./internal/status-dot";

export default {
  description:
    "Colored status-indicator dot primitive. Composes a fixed-size rounded inline-block span with a caller-supplied Tailwind color class, so an empty dot keeps its size in running text as well as in a flex row. Size variants: sm (size-1.5), md (size-2), lg (size-2.5).",
  contributions: [],
} satisfies PluginDefinition;
