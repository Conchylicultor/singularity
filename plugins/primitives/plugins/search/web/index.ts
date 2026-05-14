import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SearchInput } from "./internal/search-input";
export type { SearchInputProps } from "./internal/search-input";
export { useTextFilter } from "./internal/use-text-filter";
export type {
  UseTextFilterOptions,
  TextFilterHandle,
} from "./internal/use-text-filter";
export { filterTree, collectAllIds } from "./internal/filter-tree";

export default {
  id: "search",
  name: "Search",
  description:
    "Search input primitive: SearchInput component, useTextFilter hook for flat lists, and filterTree/collectAllIds utilities for recursive tree filtering.",
  contributions: [],
} satisfies PluginDefinition;
