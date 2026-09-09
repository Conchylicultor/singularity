import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { LinkChip, type LinkChipProps } from "./internal/link-chip";

export default {
  description:
    "Inline, clickable navigational chip — a clickable Badge drawn as an outlined tile (bg-muted, hairline border, foreground label one text rung above a plain Badge, hover:bg-accent, cursor-pointer) rather than as underlined link text, baseline-aligned for inline-in-text use, with optional leading icon and monospace label. Its passthrough lands on the chip's own button, so it can be an overlay trigger.",
  contributions: [],
} satisfies PluginDefinition;
