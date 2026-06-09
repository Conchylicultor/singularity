import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { LinkChip, type LinkChipProps } from "./internal/link-chip";

export default {
  description:
    "Inline, clickable navigational chip: bg-muted + text-primary with hover underline, baseline-aligned for inline-in-text use, with optional leading icon and monospace label.",
  contributions: [],
} satisfies PluginDefinition;
