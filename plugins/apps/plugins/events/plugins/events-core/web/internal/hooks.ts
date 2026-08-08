import { useCallback, useEffect, useRef } from "react";
import {
  useEndpoint,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import {
  useResource,
  useWindowResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  createEventSource,
  deleteEventSource,
  eventRunsRevisionResource,
  eventSourcesResource,
  eventsRevisionResource,
  getEventSourceRun,
  listEventSourceRuns,
  listRunEvents,
  refreshEventSourceNow,
  updateEventSource,
  type EventSource,
} from "../../core";

/**
 * The configured sources, live. A bounded window (newest first) — pass `limit`
 * only when a surface genuinely needs more than the descriptor's default.
 */
export function useEventSources(opts?: {
  limit?: number;
}): ResourceResult<EventSource[]> {
  return useWindowResource(eventSourcesResource, opts);
}

/**
 * The `events` revision tick. Read it to refetch a delegated events query in
 * place; never put it in a query key — that would refetch on remount rather than
 * on change, and would refetch the window from scratch on every pulse.
 */
export function useEventsRevision(): ResourceResult<{ rev: string }> {
  return useResource(eventsRevisionResource);
}

/**
 * The run ledger for one source, newest first — and LIVE.
 *
 * The rows are a plain endpoint read (a bounded, filterable list is a query, not
 * something to ship over live-state), kept fresh by the cheap
 * `events.runs-revision` scalar tick: when a run lands, this refetches the same
 * query key in place, so the loaded list keeps rendering while it updates rather
 * than flashing a skeleton. The tick is deliberately NOT part of the query key —
 * that would mint a new cache entry per revision and re-show the loading state.
 *
 * Liveness lives HERE rather than at each call site: the ledger and the source
 * row's status are written in one transaction and the status is already live, so
 * a runs list that needs a page reload contradicts the card beside it. Binding
 * the tick into the hook makes forgetting it impossible.
 */
export function useEventSourceRuns(sourceId: string, limit?: number) {
  const query = useEndpoint(
    listEventSourceRuns,
    { id: sourceId },
    limit === undefined ? undefined : { query: { limit } },
  );

  // A derived slice read, not a value this renders: all we want out of the tick
  // is the `rev` string, so `select` narrows the subscription to it.
  const selectRev = useCallback((d: { rev: string }) => d.rev, []);
  const tick = useResource(eventRunsRevisionResource, undefined, {
    select: selectRev,
  });
  const rev = tick.pending ? null : tick.data;
  const { refetch } = query;
  // Compared against the last revision acted on, not just watched as a dep: the
  // effect must fire once per genuine change, and never re-fire on a re-render
  // that happens to hand back a fresh `refetch` identity.
  const actedOn = useRef<string | null>(null);
  useEffect(() => {
    // A pending tick has nothing to say yet; the first settled `rev` refreshes
    // once, which also covers a run that finished between mount and subscribe.
    if (rev === null || rev === actedOn.current) return;
    actedOn.current = rev;
    void refetch();
  }, [rev, refetch]);

  return query;
}

/**
 * One run, by its own id. The run pane and its sections both read it through
 * this hook, so the shared query key means one fetch rather than one per
 * consumer — and a section reaching for the run's `startedAt` never has to know
 * which source it belongs to.
 */
export function useEventSourceRun(runId: string) {
  return useEndpoint(getEventSourceRun, { runId });
}

/**
 * The events one run touched, each with what that run did to it — the detail
 * behind the run row's counts. A plain endpoint read, not live state: a finished
 * run's event set is closed, so there is nothing to keep fresh.
 */
export function useRunEvents(runId: string, limit?: number) {
  return useEndpoint(
    listRunEvents,
    { runId },
    limit === undefined ? undefined : { query: { limit } },
  );
}

/** Create a source. Failures surface through the global mutation toast. */
export function useCreateEventSource() {
  return useEndpointMutation(createEventSource);
}

/** Autosave PATCH behind every source field edit. */
export function useUpdateEventSource() {
  return useEndpointMutation(updateEventSource);
}

export function useDeleteEventSource() {
  return useEndpointMutation(deleteEventSource);
}

/**
 * "Refresh now". The response is a discriminated `RefreshSourceResult` — callers
 * MUST branch on `status` rather than treating a resolved promise as success:
 * `skipped` is a resolved, legitimate non-run.
 *
 * It invalidates nothing: this resolves at `enqueued`, before the run has even
 * started, so a refetch here could only ever re-read the list unchanged. The run
 * appears when it actually lands, off the `events.runs-revision` tick.
 */
export function useRefreshEventSourceNow() {
  return useEndpointMutation(refreshEventSourceNow);
}
