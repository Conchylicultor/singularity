import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Contributions } from "./slots";
export { defineFacetTable, defineRowClick } from "./facet-table";
export { PluginChip } from "./components/plugin-chip";
export type {
  ContributionsFacetTable,
  ContributionsRowClick,
  FacetTableEntry,
  ContributionsRowClickContext,
} from "./facet-table";

export default {
  description:
    "Registry for the Studio Contributions aggregated-table surface: FacetTable + RowClick slots and factories.",
  contributions: [],
} satisfies PluginDefinition;
