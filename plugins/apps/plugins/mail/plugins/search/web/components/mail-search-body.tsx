import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  useEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { mailSearchEndpoint } from "@plugins/apps/plugins/mail/plugins/sync/core";
import { mailSearchPane } from "../panes";
import { MailSearchRow } from "./mail-search-row";

/**
 * The search surface: a sticky query input over a live result list. The backend
 * (`GET /api/mail/search`) hits Gmail's `messages.list?q=`, folds the matching
 * envelopes into the local mirror, and returns them in Gmail's relevance order —
 * so this reaches mail OLDER than the 30-day sync window, unlike the mailbox
 * list. Bodies stay lazy: opening a row hydrates it (see the reader pane).
 *
 * Debounce: there is no shared `useDebounced` primitive, so the query is
 * debounced locally (~250ms) with a `setTimeout` in an effect before it drives
 * the endpoint. (Follow-up: promote a `useDebounced` hook to primitives.)
 *
 * Pagination: the endpoint returns `nextPageToken`, but "Load more" is deferred
 * — `useEndpoint` keys each page by its query, so accumulating pages cleanly
 * needs `useInfiniteQuery`/cursor-pagination wiring. One page (25 relevance-
 * ordered hits) is correct and useful today. (Follow-up.)
 */
export function MailSearchBody(): ReactElement {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const trimmed = debounced.trim();
  const result = useEndpoint(
    mailSearchEndpoint,
    {},
    { query: { q: trimmed }, enabled: trimmed.length > 0 },
  );

  let body: ReactNode;
  if (trimmed.length === 0) {
    body = (
      <Placeholder>
        Search all mail — including messages older than the 30-day sync window.
      </Placeholder>
    );
  } else if (result.isLoading) {
    body = <Loading variant="rows" />;
  } else if (result.isError) {
    // The backend returns 409 when Gmail isn't connected — surface its message.
    body = <Placeholder tone="error">{getEndpointErrorMessage(result.error)}</Placeholder>;
  } else if (!result.data || result.data.results.length === 0) {
    body = <Placeholder>No matches.</Placeholder>;
  } else {
    body = (
      <Stack gap="none" className="p-sm">
        {result.data.results.map((m) => (
          <MailSearchRow key={m.id} message={m} />
        ))}
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
