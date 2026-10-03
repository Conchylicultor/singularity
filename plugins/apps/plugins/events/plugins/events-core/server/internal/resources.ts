import { serveCollection } from "@plugins/network/plugins/live/server";
import { eventSourceRuns, eventSources } from "../../core";
import { _eventSources, _eventSourceRuns } from "./tables";

// The sources collection over `event_sources`: its window (filterable on
// status / enabled, sortable by createdAt / name) and its `:rows` point sibling.
// Every column is on the wire — a source row is small and the whole thing is
// what the sources pane renders. `createdAt` never changes; `name` does, so a
// rename costs one bounded ids query per subscribed window (the order signature
// covers every sortable column), while a status / fingerprint / watermark write
// stays an in-place upsert.
export const eventSourcesServed = serveCollection(eventSources, {
  from: _eventSources,
});

// The run ledger over `event_source_runs`: every `EventSourceRun` field is a
// column of the table by name, so the projection is exactly the row schema.
// No base `where`: the source pane scopes a window to its source (`sourceId`, a
// filterable column), and the run pane reads one run through `:rows`. A run
// row is written once, at the END of its run, in the same transaction as the
// source row's status (`run-ledger.ts`); the change feed routes that insert —
// and the 30-day retention sweep's and a source delete's cascaded deletes — to
// the tuples holding the run.
export const eventSourceRunsServed = serveCollection(eventSourceRuns, {
  from: _eventSourceRuns,
});
