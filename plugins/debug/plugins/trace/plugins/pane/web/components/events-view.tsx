import { useMemo, type ReactElement } from "react";
import { MdRefresh } from "react-icons/md";
import {
  useEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { listTraces } from "@plugins/debug/plugins/trace/plugins/engine/web";
import type { TraceListItem } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { triggerVariant } from "../internal/trigger-meta";
import { traceDetailPane } from "../panes";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const TRACE_EVENTS = defineDataView("debug.trace.events");

// The Events tab: recent slow-event traces, hydrated on open via GET /api/traces
// (metadata only — no snapshot blob) with a manual Refresh. No live resource: a
// trace is written exactly when the system is slow, so a change-feed push per
// write would add load at the worst moment (the same reason slow_ops is
// change-feed-excluded). Row activate opens the detail Gantt.
export function EventsView(): ReactElement {
  const openPane = useOpenPane();
  const { data, error, isLoading, refetch, isFetching } = useEndpoint(listTraces, {});
  const selectedId = traceDetailPane.useRouteEntry()?.params.id;

  const rows = useMemo(() => data?.items ?? [], [data]);

  const fields = useMemo<FieldDef<TraceListItem>[]>(() => {
    const kinds = [...new Set(rows.map((r) => r.triggerKind))].sort();
    return [
      {
        id: "createdAt",
        label: "When",
        type: "date",
        value: (r) => new Date(r.createdAt),
        cell: (r) => (
          <span className="text-muted-foreground">
            <RelativeTime date={new Date(r.createdAt)} />
          </span>
        ),
        sortable: true,
        width: "7rem",
      },
      {
        id: "triggerKind",
        label: "Trigger",
        type: "enum",
        value: (r) => r.triggerKind,
        options: kinds.map((k) => ({ value: k, label: k })),
        cell: (r) => (
          <Badge variant={triggerVariant(r.triggerKind)} mono>
            {r.triggerKind}
          </Badge>
        ),
        sortable: true,
        filterable: true,
        width: "9rem",
      },
      {
        id: "triggerLabel",
        label: "Operation",
        type: "text",
        primary: true,
        value: (r) => r.triggerLabel,
        cell: (r) => (
          <Text as="span" variant="caption" className="truncate font-mono" title={r.triggerLabel}>
            {r.triggerLabel}
          </Text>
        ),
        width: "minmax(0,1fr)",
      },
      {
        id: "durationMs",
        label: "Duration",
        type: "number",
        value: (r) => Math.round(r.durationMs),
        cell: (r) => (
          <span className="font-mono tabular-nums">{Math.round(r.durationMs)} ms</span>
        ),
        align: "end",
        sortable: true,
        width: "6rem",
      },
      {
        id: "overBudget",
        label: "Over budget",
        type: "number",
        value: (r) => (r.thresholdMs > 0 ? r.durationMs / r.thresholdMs : 0),
        cell: (r) =>
          r.thresholdMs > 0 ? (
            <span className="font-mono tabular-nums text-muted-foreground">
              ×{(r.durationMs / r.thresholdMs).toFixed(1)}
            </span>
          ) : null,
        align: "end",
        sortable: true,
        width: "6rem",
      },
    ];
  }, [rows]);

  if (error) {
    return (
      <Inset pad="lg">
        <Placeholder tone="error">{getEndpointErrorMessage(error)}</Placeholder>
      </Inset>
    );
  }

  return (
    <DataView<TraceListItem>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      storageKey={TRACE_EVENTS}
      views={["table", "list"]}
      defaultView="table"
      loading={isLoading}
      selectedRowId={selectedId}
      onRowActivate={(r) => openPane(traceDetailPane, { id: r.id }, { mode: "push" })}
      actions={
        <Button variant="ghost" onClick={() => void refetch()} className="gap-xs">
          <MdRefresh className={isFetching ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      }
      emptyState="No slow-event traces recorded yet."
    />
  );
}
