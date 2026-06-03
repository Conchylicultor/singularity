import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  FilterChip,
  FilterGroup,
  useChipFilter,
} from "./internal/filter-chips";
export type {
  FilterChipProps,
  FilterGroupProps,
  ChipFilterHandle,
} from "./internal/filter-chips";

export default {
  name: "Filter Chips",
  description:
    "Toggle-chip filter primitive: FilterChip, FilterGroup, and useChipFilter hook for single-select enum filtering.",
  contributions: [],
} satisfies PluginDefinition;
