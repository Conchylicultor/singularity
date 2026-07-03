import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { ScrollSentinel } from "@plugins/primitives/plugins/cursor-pagination/web";
import { mailSearchPane } from "../panes";
import { MailSearchRow } from "./mail-search-row";
import { useMailSearch } from "../internal/use-mail-search";

/**
 * The search surface: a sticky query input over a live result list. The backend
 * (`GET /api/mail/search`) hits Gmail's `messages.list?q=`, folds the matching
 * envelopes into the local mirror, and returns them in Gmail's relevance order —
 * so this reaches mail OLDER than the 30-day sync window, unlike the mailbox
 * list. Bodies stay lazy: opening a row hydrates it (see the reader pane).
 *
 * Debounce: there is no shared `useDebounced` primitive, so the query is
 * debounced locally (~250ms) with a `setTimeout` in an effect before it drives
 * the search. (Follow-up: promote a `useDebounced` hook to primitives.)
 *
 * Pagination: `useMailSearch` accumulates Gmail's opaque `nextPageToken` pages
 * via `useInfiniteQuery` and auto-fetches the next page as a `ScrollSentinel`
 * scrolls into view (the reader pane's single scroll). A failed next-page fetch
 * shows an inline Retry instead of hot-looping the sentinel.
 */
export function MailSearchBody(): ReactElement {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const trimmed = debounced.trim();
  const {
    results,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    sentinelRef,
    fetchNextPage,
  } = useMailSearch(trimmed);

  let body: ReactNode;
  if (trimmed.length === 0) {
    body = (
      <Placeholder>
        Search all mail — including messages older than the 30-day sync window.
      </Placeholder>
    );
  } else if (isLoading) {
    body = <Loading variant="rows" />;
  } else if (isError) {
    // The backend returns 409 when Gmail isn't connected — surface its message.
    body = <Placeholder tone="error">{getEndpointErrorMessage(error)}</Placeholder>;
  } else if (results.length === 0 && !hasNextPage) {
    body = <Placeholder>No matches.</Placeholder>;
  } else {
    body = (
      <Stack gap="none" className="p-sm">
        {results.map((r) => (
          <MailSearchRow key={r.threadId} result={r} />
        ))}
        {isFetchingNextPage && <Loading variant="spinner" label="Loading…" />}
        {isFetchNextPageError && (
          <Center axis="horizontal">
            <Inset pad="sm">
              <Stack gap="xs" align="center">
                <Placeholder tone="error">Couldn't load more.</Placeholder>
                <ControlSizeProvider size="sm">
                  <Button variant="ghost" onClick={() => fetchNextPage()}>
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
      </Stack>
    );
  }

  return (
    <PaneChrome pane={mailSearchPane} title="Search">
      <Sticky edge="top" mask>
        <Inset pad="sm">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all mail"
            autoFocus
          />
        </Inset>
      </Sticky>
      {body}
    </PaneChrome>
  );
}
