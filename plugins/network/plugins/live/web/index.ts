import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useLive, useLiveRow } from "./internal/use-live";
export { mapRow } from "./internal/map-row";
export { useLiveScroll } from "./internal/use-live-scroll";
export type {
  LivePagesOptions,
  LivePagesResult,
} from "./internal/use-live-pages";
export { MAX_LIVE_PAGES } from "../shared/page-chain";
export type {
  LiveScrollOptions,
  LiveScrollResult,
  LiveSegmentError,
} from "./internal/use-live-scroll";
export type { ScrollTruncation } from "../shared/scroll-plan";
export type {
  LiveAllSelect,
  LiveIdsQuery,
  LiveListResult,
  LiveRowResult,
} from "./internal/use-live";

export default {
  description:
    "Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — a grouping of a filterable column's values with counts, paged the same way, a collection declared `all` whole — every row in its declared order, or a select-scoped slice of it — or an explicit id set), useLiveRow (one row: loading, failed, found, or determinately absent), with mapRow reducing a row read to a ResourceResult of what the row means; useLive also reads a typed-query liveValue (its question encoded to one canonical tuple) and a cursor-paged one (a live chain of pages — re-minted when a boundary moves, deduped by id, capped at MAX_LIVE_PAGES); and useLiveScroll (a scroll collection read as live segments — bounded windows tiling the order by server-minted row-key cuts, grown, split, merged and collapsed so the rendered rows stay a gap-free prefix).",
  contributions: [],
} satisfies PluginDefinition;
