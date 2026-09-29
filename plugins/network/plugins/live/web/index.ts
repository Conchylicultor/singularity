import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useLive, useLiveRow } from "./internal/use-live";
export { mapRow } from "./internal/map-row";
export type {
  LiveIdsQuery,
  LiveListResult,
  LivePaging,
  LiveRowResult,
} from "./internal/use-live";

export default {
  description:
    "Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — a grouping of a filterable column's values with counts, paged the same way, or an explicit id set) and useLiveRow (one row: loading, failed, found, or determinately absent), with mapRow reducing a row read to a ResourceResult of what the row means.",
  contributions: [],
} satisfies PluginDefinition;
