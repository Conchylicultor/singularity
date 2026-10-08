import type { ReactNode } from "react";
import {
  InfiniteScrollFooter,
  useInfiniteScroll,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { DataViewSectionPaging } from "../../core";

/**
 * One section's own paging footer — a declared section's (`section.paging`):
 * the same pieces the body's footer is made of (`useInfiniteScroll` +
 * `InfiniteScrollFooter`: loading-more, Retry on a failed page, the sentinel,
 * the line saying it stops), so a section pages exactly as a whole list does.
 * Its first `loadMore()` is what starts the section's read, so a section reads
 * nothing until its footer has come into view.
 *
 * A read failing under rows that stay on screen says so here, at the end of
 * its section, with its own Retry.
 */
export function SectionPagingFooter(props: {
  paging: DataViewSectionPaging;
  /** The entries the section shows — the count a stopped list states. */
  shown: number;
}): ReactNode {
  const { paging, shown } = props;
  const handle = useInfiniteScroll({
    hasNextPage: paging.canGrow,
    isFetchingNextPage: paging.growing,
    isFetchNextPageError: paging.stalled != null,
    fetchNextPage: paging.loadMore,
    ...(paging.stalled ? { retry: paging.stalled.retry } : {}),
  });
  return (
    <>
      {paging.notices.length > 0 ? (
        <Stack gap="xs" className="py-xs">
          {paging.notices.map((n) => (
            <Placeholder key={n.key} tone="error">
              {`Some rows could not refresh — ${n.error.message} `}
              <Button variant="ghost" onClick={() => n.retry()}>
                Retry
              </Button>
            </Placeholder>
          ))}
        </Stack>
      ) : null}
      <InfiniteScrollFooter
        handle={handle}
        truncated={
          paging.truncated === false
            ? false
            : { shown, hint: paging.truncated.hint }
        }
      />
    </>
  );
}
