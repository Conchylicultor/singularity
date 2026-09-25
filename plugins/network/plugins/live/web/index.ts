import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useLive, useLiveRow } from "./internal/use-live";
export type {
  LiveIdsQuery,
  LiveListResult,
  LivePaging,
  LiveRowResult,
} from "./internal/use-live";

export default {
  description:
    "Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — or an explicit id set) and useLiveRow (one row: pending, found, or determinately absent).",
  contributions: [],
} satisfies PluginDefinition;
