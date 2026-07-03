import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useCursorPagination } from "./internal/use-cursor-pagination";
export type {
  UseCursorPaginationOptions,
  CursorPaginationHandle,
} from "./internal/use-cursor-pagination";
export { ScrollSentinel } from "./internal/scroll-sentinel";
export type { ScrollSentinelProps } from "./internal/scroll-sentinel";
export { useInfiniteScroll } from "./internal/use-infinite-scroll";
export type {
  InfiniteScrollOptions,
  InfiniteScrollHandle,
} from "./internal/use-infinite-scroll";
export { InfiniteScrollFooter } from "./internal/infinite-scroll-footer";
export type { InfiniteScrollFooterProps } from "./internal/infinite-scroll-footer";
export { cursorPageSchema } from "../core";
export type { CursorPage } from "../core";

export default {
  description:
    "Cursor-pagination primitive: the error-gated useInfiniteScroll observer + InfiniteScrollFooter (load-more spinner / Retry / sentinel), the useCursorPagination keyset wrapper (frozen-cursor + useInfiniteQuery), and the ScrollSentinel component.",
  contributions: [],
} satisfies PluginDefinition;
