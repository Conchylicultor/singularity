import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useLive, useLiveRow } from "./internal/use-live";
export { mapRow } from "./internal/map-row";
export { useLiveCollectionPages } from "./internal/use-live-collection-pages";
export type {
  LivePagesOptions,
  LivePagesResult,
} from "./internal/use-live-pages";
export { MAX_LIVE_PAGES } from "../shared/page-chain";
export type {
  LiveCollectionPageError,
  LiveCollectionPagePlaceholder,
  LiveCollectionPagesOptions,
  LiveCollectionPagesQuery,
  LiveCollectionPagesResult,
} from "./internal/use-live-collection-pages";
export { mintVisibleRange } from "./internal/visible-range";
export type { VisibleRange } from "./internal/visible-range";
export type { PagesTruncation } from "../shared/page-plan";
export type {
  LiveAllSelect,
  LiveIdsQuery,
  LiveListResult,
  LiveRowResult,
} from "./internal/use-live";

export default {
  description:
    "Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — a grouping of a filterable column's values with counts, paged the same way, a collection declared `all` whole — every row in its declared order, or a select-scoped slice of it — or an explicit id set), useLiveRow (one row: loading, failed, found, or determinately absent), with mapRow reducing a row read to a ResourceResult of what the row means; useLive also reads a typed-query liveValue (its question encoded to one canonical tuple) and a cursor-paged one (a live chain of pages — re-minted when a boundary moves, deduped by id, capped at MAX_LIVE_PAGES); and useLiveCollectionPages (a scroll collection read with no depth limit as key-range pages — bounded windows tiling the order by server-minted row-key cuts, split when full and merged when small, the pages near a measured viewport live and the rest held stale up to a per-reader budget, past which they are height-keeping placeholders drawn before and after the rows).",
  contributions: [],
} satisfies PluginDefinition;
