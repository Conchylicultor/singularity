import { useMemo } from "react";
import {
  useLiveCollectionPages,
  type LiveCollectionPagesQuery,
  type LiveCollectionPagesResult,
} from "@plugins/network/plugins/live/web";
import type { LiveScrollCollection } from "@plugins/network/plugins/live/core";
import type { DataViewPaging } from "../../core";
import { pagesPaging } from "./pages-paging";
import { usePagesViewport } from "./pages-viewport";

/** A paged read's paging, before a consumer says which of its rows are the read's. */
export type LivePagesPaging = Omit<DataViewPaging<unknown>, "isPaged">;

/**
 * Read a `scroll: true` collection as live key-range pages for a DataView to
 * show: `pages` is `network/live`'s `useLiveCollectionPages` read, and `paging` (once
 * it is `ready`, else `null`) is what the DataView showing its rows takes as
 * `paging` — whose `viewport` is where the DataView reports the rows it has
 * on screen, which `pages` keeps its pages live by. The viewport and the
 * paging are minted together here, so a read cannot page by a viewport
 * nothing measures: hand `paging` to the DataView drawing the rows (with
 * `isPaged` / `total` added as the consumer knows them).
 */
export function useLivePagesPaging<Row, F, S extends string>(
  collection: LiveScrollCollection<Row, F, S> | null,
  query: LiveCollectionPagesQuery<F, S> | null,
  options?: { resetKey?: string },
): { pages: LiveCollectionPagesResult<Row>; paging: LivePagesPaging | null } {
  const { viewport, sink } = usePagesViewport();
  const resetKey = options?.resetKey;
  const pages = useLiveCollectionPages(
    collection,
    query,
    resetKey === undefined ? { viewport } : { viewport, resetKey },
  );
  const paging = useMemo(
    () => (pages.status === "ready" ? pagesPaging<unknown>(pages, sink) : null),
    [pages, sink],
  );
  return useMemo(() => ({ pages, paging }), [pages, paging]);
}
