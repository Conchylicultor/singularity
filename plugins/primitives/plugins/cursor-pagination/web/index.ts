import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useCursorPagination } from "./internal/use-cursor-pagination";
export type {
  UseCursorPaginationOptions,
  CursorPaginationHandle,
} from "./internal/use-cursor-pagination";
export { ScrollSentinel } from "./internal/scroll-sentinel";
export type { ScrollSentinelProps } from "./internal/scroll-sentinel";
export { cursorPageSchema } from "../core";
export type { CursorPage } from "../core";

export default {
  id: "cursor-pagination",
  name: "Cursor Pagination",
  description:
    "Cursor-pagination primitive: useCursorPagination hook with frozen-cursor capture, useInfiniteQuery wiring, IntersectionObserver auto-fetch, and ScrollSentinel component.",
  contributions: [],
} satisfies PluginDefinition;
