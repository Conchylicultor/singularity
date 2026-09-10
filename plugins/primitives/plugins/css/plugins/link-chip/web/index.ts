import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { LinkChip, type LinkChipProps } from "./internal/link-chip";

export default {
  description:
    "Inline, clickable navigational chip — a clickable Badge drawn as an outlined tile (bg-muted, hairline border, hover:bg-accent) rather than as underlined link text, its label sitting on the baseline of the sentence holding it. A proportional label takes one text rung above a plain Badge so it holds up beside body copy; a monospace label keeps Badge's own rung, the size markdown gives inline code in the same prose, because the mono face already sets wider at any given rung. Its passthrough lands on the chip's own button, so it can be an overlay trigger.",
  contributions: [],
} satisfies PluginDefinition;
