import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SectionCard, type SectionCardProps } from "./internal/section-card";

export default {
  description:
    "Titled collapsible card primitive: Card chrome + a SectionHeaderRow trigger (chevron, icon, title, sibling header actions) + an unmounted-while-collapsed body. The sanctioned home for the 'card whose title expands it' shape, so a stack of such cards is uniform by construction.",
  contributions: [],
} satisfies PluginDefinition;
