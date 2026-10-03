import { z } from "zod";
import { liveCollection } from "@plugins/network/plugins/live/core";
import {
  liveBoolean,
  liveInstant,
  liveNumber,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { EventSourceRunSchema, EventSourceSchema } from "./schema";
import { RUN_OUTCOMES, SOURCE_STATUSES } from "./vocab";

/**
 * The configured sources, as a live collection: a bounded window (newest first
 * by default, 100 / max 500) plus its `:rows` point sibling for by-id reads.
 * The set is small in practice but user-grown, so it gets a real bound rather
 * than an unbounded read.
 *
 * Consumers may filter on `status` / `enabled` and sort by `createdAt` / `name`
 * (`useLive(eventSources, { … })`); one row by id is `useLiveRow` — which reads
 * the point sibling, so a source outside any window is still found.
 */
export const eventSources = liveCollection("events.sources", {
  row: EventSourceSchema,
  id: "id",
  filterable: {
    status: liveText(z.enum(SOURCE_STATUSES)),
    enabled: liveBoolean(),
  },
  sortable: ["createdAt", "name"],
  default: { orderBy: [["createdAt", "desc"]], limit: 100 },
  maxLimit: 500,
});

/**
 * The DataView surface the run ledger is listed on (the source pane's Runs
 * section, `defineDataView("events.source-runs")`): the scope whose custom
 * columns sort and filter the window. The DataView declares the same literal
 * and asserts at mount that the two agree.
 */
const SOURCE_RUNS_VIEW_ID = "events.source-runs";

/**
 * The run ledger (`event_source_runs`) as a live collection: a bounded,
 * scrollable window — the source pane scopes it to one source with
 * `.scoped({ where: { sourceId } })` — plus its `:rows` point sibling, which is
 * how the run pane and its sections read one run by its OWN id (a deep link
 * resolves from the URL, never from whatever window the list has loaded).
 *
 * The ledger row and the source row's status are written in ONE transaction
 * (`run-ledger.ts`), and the source window is live — so the ledger must be too,
 * or the card beside it contradicts it. The change feed routes each run row's
 * write to the tuples holding it: no revision tick, no refetch.
 *
 * A scroll collection: retention keeps 30 days, and a source on a short cadence
 * writes more than one window of that. `flags` (the caveats list) is on the
 * wire but display-only — no saved view sorts or filters by it.
 */
export const eventSourceRuns = liveCollection("events.source-runs", {
  row: EventSourceRunSchema,
  id: "id",
  filterable: {
    sourceId: liveText(),
    outcome: liveText(z.enum(RUN_OUTCOMES)),
    error: liveText(),
    startedAt: liveInstant(),
    finishedAt: liveInstant(),
    eventsFound: liveNumber(),
    eventsCreated: liveNumber(),
    eventsUpdated: liveNumber(),
    eventsDisappeared: liveNumber(),
    durationMs: liveNumber(),
  },
  sortable: [
    "startedAt",
    "finishedAt",
    "outcome",
    "eventsFound",
    "eventsCreated",
    "eventsUpdated",
    "eventsDisappeared",
    "durationMs",
  ],
  default: { orderBy: [["startedAt", "desc"]], limit: 100 },
  maxLimit: 500,
  scroll: true,
  columnScope: SOURCE_RUNS_VIEW_ID,
});
