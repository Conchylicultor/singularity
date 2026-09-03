import { useRef } from "react";

import { useInView } from "@plugins/primitives/plugins/dom/plugins/in-view/web";

export interface InfiniteScrollOptions {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  /**
   * `IntersectionObserver` `rootMargin` — grow the sentinel's trigger box to
   * prefetch the next page before it scrolls fully into view (e.g. `"400px"`).
   * Omitted → the sentinel fires only once actually intersecting.
   */
  rootMargin?: string;
}

export interface InfiniteScrollHandle {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  retry: () => void;
}

/**
 * The single error-gated infinite-scroll observer. Watches `sentinelRef` (via
 * the `in-view` primitive) and fires `fetchNextPage()` only while there is a
 * next page, no fetch is in flight, AND the previous next-page fetch did NOT
 * error. Gating on `isFetchNextPageError` is what kills the hot-loop: without
 * it, a failed fetch flips `isFetchingNextPage` false→true→false, which
 * rebuilds the observer, and the fresh observer immediately re-fires against
 * the still-intersecting sentinel — retrying the failing request in a tight
 * loop. `retry` (== `fetchNextPage`) is the manual recovery path; calling it
 * re-enters `isFetchingNextPage`, which rebuilds the observer and re-arms it
 * once the error clears.
 */
export function useInfiniteScroll(
  opts: InfiniteScrollOptions,
): InfiniteScrollHandle {
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    rootMargin,
  } = opts;
  const sentinelRef = useRef<HTMLDivElement>(null);
  // The entry handed over is the most recent of the delivery batch, where this
  // read `entries[0]`. For a single sentinel that IS its current state, and an
  // earlier entry of a batch can already be superseded.
  useInView(
    sentinelRef,
    (entry) => {
      if (
        entry.isIntersecting &&
        hasNextPage &&
        !isFetchingNextPage &&
        !isFetchNextPageError
      ) {
        fetchNextPage();
      }
    },
    {
      rootMargin,
      // Today's effect dependency array, unchanged — and it is the whole
      // mechanism, not bookkeeping. `useInView` stabilises the callback, so only
      // a `deps` change rebuilds the observer, and the rebuild is what re-fires
      // against the sentinel that never moved. Drop a gate flag from here and
      // pagination stalls after page 1 without a single error.
      deps: [
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        rootMargin,
      ],
    },
  );

  return {
    sentinelRef,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    retry: fetchNextPage,
  };
}
