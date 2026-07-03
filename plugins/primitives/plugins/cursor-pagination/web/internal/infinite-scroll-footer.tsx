import type { ReactElement } from "react";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ScrollSentinel } from "./scroll-sentinel";
import type { InfiniteScrollHandle } from "./use-infinite-scroll";

export interface InfiniteScrollFooterProps {
  handle: InfiniteScrollHandle;
  loadingLabel?: string;
  errorLabel?: string;
}

/**
 * The single reusable infinite-scroll footer: a "loading more" spinner while a
 * page is fetching, a "couldn't load more" placeholder + Retry when the last
 * next-page fetch errored, and the observer sentinel (hidden while errored, so
 * it never re-arms behind the Retry button). Pair with `useInfiniteScroll`.
 */
export function InfiniteScrollFooter({
  handle,
  loadingLabel = "Loading…",
  errorLabel = "Couldn't load more.",
}: InfiniteScrollFooterProps): ReactElement {
  const { isFetchingNextPage, isFetchNextPageError, hasNextPage, sentinelRef, retry } =
    handle;
  return (
    <>
      {isFetchingNextPage && <Loading variant="spinner" label={loadingLabel} />}
      {isFetchNextPageError && (
        <Center axis="horizontal">
          <Inset pad="sm">
            <Stack gap="xs" align="center">
              <Placeholder tone="error">{errorLabel}</Placeholder>
              <ControlSizeProvider size="sm">
                <Button variant="ghost" onClick={() => retry()}>
                  Retry
                </Button>
              </ControlSizeProvider>
            </Stack>
          </Inset>
        </Center>
      )}
      <ScrollSentinel
        sentinelRef={sentinelRef}
        show={hasNextPage && !isFetchNextPageError}
      />
    </>
  );
}
