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
  eventSourcesResource,
  eventsRevisionResource,
  getEventSourceRun,
  listEventSourceRuns,
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

/** The run ledger for one source, newest first. */
export function useEventSourceRuns(sourceId: string, limit?: number) {
  return useEndpoint(
    listEventSourceRuns,
    { id: sourceId },
    limit === undefined ? undefined : { query: { limit } },
  );
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
 */
export function useRefreshEventSourceNow() {
  return useEndpointMutation(refreshEventSourceNow, {
    invalidates: [listEventSourceRuns],
  });
}
