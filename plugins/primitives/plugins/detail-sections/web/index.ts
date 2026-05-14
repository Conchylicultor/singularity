import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { defineDetailSections } from "./internal/define-detail-sections";
export type { DetailSections } from "./internal/define-detail-sections";

export default {
  id: "detail-sections",
  name: "Detail Sections",
  description:
    "Factory for extensible detail-view section slots with built-in Reorder DnD.",
  contributions: [],
} satisfies PluginDefinition;
