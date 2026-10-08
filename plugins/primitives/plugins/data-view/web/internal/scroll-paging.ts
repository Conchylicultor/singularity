import type {
  LiveScrollResult,
  ScrollTruncation,
} from "@plugins/network/plugins/live/web";
import type { DataViewPaging } from "../../core";

/** A settled scroll read — the arm that has rows to page past. */
export type SettledScroll = Extract<
  LiveScrollResult<unknown>,
  { status: "ready" }
>;

/**
 * What a list that stopped short tells the user (the footer's line), per
 * reason — in its terms; the scroll's own wording goes to its log.
 */
const TRUNCATION_HINT: Readonly<Record<ScrollTruncation, string>> = {
  "segment-cap": "narrow the filter to see the rest",
  "long-sort-key":
    "the rest cannot be scrolled to in this sort — narrow the filter, or sort by another field",
};

/**
 * A settled `useLiveScroll` read as a DataView's {@link DataViewPaging}: the
 * failures paging stopped on become the footer's Retry (re-reading each of
 * them), the rest notices above the rows. A live `source` maps its own scroll
 * through this; a consumer deriving in-memory rows from a scroll passes the
 * result as `paging` (adding `isPaged` when the scroll feeds only some rows).
 */
export function scrollPaging<TRow>(
  scroll: SettledScroll,
): DataViewPaging<TRow> {
  const blocking = scroll.segmentErrors.filter((e) => e.blocksPaging);
  return {
    canGrow: scroll.canGrow,
    growing: scroll.growing,
    loadMore: scroll.loadMore,
    complete: scroll.exhausted,
    stalled:
      blocking.length === 0
        ? null
        : {
            retry: () => {
              for (const e of blocking) e.retry();
            },
          },
    truncated:
      scroll.truncated === false
        ? false
        : { hint: TRUNCATION_HINT[scroll.truncated.reason] },
    notices: scroll.segmentErrors
      .filter((e) => !e.blocksPaging)
      .map((e) => ({
        key: e.key,
        afterRowId: e.afterRowId,
        error: e.error,
        retry: e.retry,
      })),
  };
}
