import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Backlinks } from "./components/backlinks";
export type { BacklinksProps } from "./components/backlinks";

export default {
  description:
    "Backlinks index for cross-page links: page_links edge table, extractor registry, reindex, backlinks resource.",
  contributions: [],
} satisfies PluginDefinition;
