import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { viewsDescriptor } from "../shared/views-config";

export default {
  description:
    "Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter.",
  contributions: [],
} satisfies ServerPluginDefinition;
