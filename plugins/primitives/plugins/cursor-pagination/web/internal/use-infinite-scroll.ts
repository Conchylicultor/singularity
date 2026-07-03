import { useEffect, useRef } from "react";

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
 * The single error-gated infinite-scroll observer. Attaches an
 * IntersectionObserver to `sentinelRef` and fires `fetchNextPage()` only while
 * there is a next page, no fetch is in flight, AND the previous next-page fetch
 * did NOT error. Gating on `isFetchNextPageError` is what kills the hot-loop:
 * without it, a failed fetch flips `isFetchingNextPage` false→true→false, the
 * effect re-runs and recreates the observer, and the fresh observer immediately
 * re-fires against the still-intersecting sentinel — retrying the failing
 * request in a tight loop. `retry` (== `fetchNextPage`) is the manual recovery
 * path; calling it re-enters `isFetchingNextPage`, which re-runs this effect and
 * re-arms the observer once the error clears.
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
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (
          entry?.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isFetchNextPageError
        ) {
          fetchNextPage();
        }
      },
      rootMargin ? { rootMargin } : undefined,
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    rootMargin,
  ]);

  return {
    sentinelRef,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    retry: fetchNextPage,
  };
}
