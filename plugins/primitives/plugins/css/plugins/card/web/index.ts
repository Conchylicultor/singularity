import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Card, type CardProps } from "./internal/card";

export default {
  description:
    "Card chrome primitive (rounded + border + bg + padding) with the Ctrl+A select-scope baked into its root, so cards are a sanctioned home for ad-hoc card markup.",
  contributions: [],
} satisfies PluginDefinition;
