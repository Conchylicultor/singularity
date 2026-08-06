import { useMemo, type ReactNode } from "react";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { useEventSourceRuns } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventSourceRun } from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  RUN_OUTCOME_OPTIONS,
  formatDuration,
} from "@plugins/apps/plugins/events/plugins/sources/web";
import { RunActions } from "../slots";
import { RunRow } from "./run-row";

/**
 * The run ledger, config-backed like every DataView: the view instances live
 * only in `config/apps/events/sources/source-detail/runs/events.source-runs.jsonc`.
 */
const RUNS_VIEW = defineDataView("events.source-runs");

/** How many runs to load. The ledger is retention-swept at 30 days upstream. */
const RUN_LIMIT = 50;

/**
 * Stable identity for the loading render, so a re-render while the fetch is in
 * flight does not churn the DataView's row pipeline. Never a "failure" value —
 * `loading` below is what distinguishes empty-because-loading from empty.
 */
const EMPTY_RUNS: EventSourceRun[] = [];

export function SourceRunsSection({
  sourceId,
}: {
  sourceId: string;
}): ReactNode {
  const query = useEventSourceRuns(sourceId, RUN_LIMIT);

  // Every column is a typed field, so "show me only the failures" is a filter on
  // `outcome` rather than a bespoke chip — including the `unchanged` runs, which
  // are the whole reason a cheap run is recorded at all.
  const fields = useMemo<FieldDef<EventSourceRun>[]>(
    () => [
      {
        id: "startedAt",
        label: "Started",
        type: "date",
        primary: true,
        value: (r) => r.startedAt,
      },
      {
        id: "outcome",
        label: "Outcome",
        type: "enum",
        options: RUN_OUTCOME_OPTIONS,
        value: (r) => r.outcome,
      },
      {
        id: "eventsFound",
        label: "Found",
        type: "number",
        value: (r) => r.eventsFound,
        align: "end",
      },
      {
        id: "eventsCreated",
        label: "New",
        type: "number",
        value: (r) => r.eventsCreated,
        align: "end",
      },
      {
        id: "eventsUpdated",
        label: "Updated",
        type: "number",
        value: (r) => r.eventsUpdated,
        align: "end",
      },
      {
        id: "eventsDisappeared",
        label: "Gone",
        type: "number",
        value: (r) => r.eventsDisappeared,
        align: "end",
      },
      {
        id: "durationMs",
        label: "Duration",
        type: "number",
        value: (r) => r.durationMs,
        cell: (r) => formatDuration(r.durationMs) ?? "—",
        align: "end",
      },
      { id: "error", label: "Error", type: "text", value: (r) => r.error },
    ],
    [],
  );

  // A failed fetch is its own state, never an eternal skeleton: "the ledger is
  // unreachable" and "this source has never run" are different answers to the
  // question this card exists to settle.
  if (query.isError) {
    return <Placeholder tone="error">{getEndpointErrorMessage(query.error)}</Placeholder>;
  }

  const runs = query.data;

  return (
    <DataView<EventSourceRun>
      storageKey={RUNS_VIEW}
      rows={runs ?? EMPTY_RUNS}
      fields={fields}
      rowKey={(r) => r.id}
      itemActions={RunActions}
      views={["list", "table"]}
      loading={runs === undefined}
      viewOptions={{
        list: { size: "sm", renderRow: (r: EventSourceRun) => <RunRow run={r} /> },
      }}
      emptyState="No runs yet — use Refresh now, or wait for the cadence to come round."
    />
  );
}
