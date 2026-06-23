import { useMemo } from "react";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { useStaleFrontend } from "@plugins/build/web";
import { reportsResource } from "@plugins/reports/core";
import type { Report } from "@plugins/reports/core";
import { Reports } from "@plugins/reports/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const REPORTS_VIEW = defineDataView("debug.reports");

export function ReportsView({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const result = useResource(reportsResource);
  // One render path for both states (mirrors the sonata library): while
  // loading, DataView renders its own skeleton via `loading` and the field
  // schema is still built from the (empty) rows.
  return matchResource(result, {
    pending: () => (
      <ReportsTable rows={[]} loading selectedId={selectedId} onSelect={onSelect} />
    ),
    error: () => (
      <ReportsTable rows={[]} loading selectedId={selectedId} onSelect={onSelect} />
    ),
    ready: (rows) => (
      <ReportsTable
        rows={rows}
        loading={false}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    ),
  });
}

function ReportsTable({
  rows,
  loading,
  selectedId,
  onSelect,
}: {
  rows: Report[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  // Enum options derived from the live rows so the filter chip lists exactly
  // the kinds / sources currently present.
  const fields: FieldDef<Report>[] = useMemo(() => {
    const distinct = (pick: (r: Report) => string) =>
      [...new Set(rows.map(pick))].sort().map((v) => ({ value: v, label: v }));

    return [
      {
        id: "kind",
        label: "Kind",
        type: "enum",
        value: (r) => r.kind,
        options: distinct((r) => r.kind),
        cell: (r) => (
          <Badge variant="muted" className="font-mono">
            {r.kind}
          </Badge>
        ),
        sortable: true,
        filterable: true,
        width: "10rem",
      },
      {
        id: "source",
        label: "Source",
        type: "enum",
        value: (r) => r.source,
        options: distinct((r) => r.source),
        cell: (r) => (
          <Badge variant="muted" className="font-mono">
            {r.source}
          </Badge>
        ),
        sortable: true,
        filterable: true,
        width: "10rem",
      },
      {
        id: "noise",
        label: "Noise",
        type: "bool",
        value: (r) => r.noise,
        cell: (r) => (r.noise ? <Badge variant="warning">noise</Badge> : null),
        sortable: false,
        filterable: true,
        width: "6rem",
      },
      {
        id: "rateLimited",
        label: "Rate-limited",
        type: "bool",
        value: (r) => r.rateLimited,
        cell: (r) =>
          r.rateLimited ? <Badge variant="destructive">rate-limited</Badge> : null,
        sortable: false,
        filterable: true,
        width: "8rem",
      },
      {
        id: "count",
        label: "×",
        type: "int",
        value: (r) => r.count,
        cell: (r) =>
          r.count > 1 ? (
            <span className="tabular-nums text-muted-foreground">×{r.count}</span>
          ) : null,
        sortable: true,
        align: "end",
        width: "4rem",
      },
      {
        id: "lastSeen",
        label: "When",
        type: "date",
        value: (r) => r.lastSeenAt,
        cell: (r) => (
          <span className="text-muted-foreground">
            <RelativeTime date={r.lastSeenAt} />
          </span>
        ),
        sortable: true,
        width: "7rem",
      },
      {
        id: "context",
        label: "",
        type: "text",
        // Presentational-only: the attribution badges depend on client hooks,
        // so this field carries no comparable value and is excluded from
        // search / filter / sort.
        value: () => "",
        cell: (r) => <AttributionBadges report={r} />,
        sortable: false,
        filterable: false,
        width: "auto",
      },
      {
        id: "summary",
        label: "Summary",
        type: "text",
        // `value` returns the human message so full-text search matches the
        // summary; the visible cell still routes through the per-kind slot.
        value: (r) => r.message,
        cell: (r) => <Reports.KindView.Dispatch report={r} />,
        primary: true,
        sortable: false,
        width: "minmax(0,2fr)",
      },
    ];
  }, [rows]);

  return (
    <DataView<Report>
      rows={rows}
      fields={fields}
      rowKey={(r) => r.id}
      views={["table", "list"]}
      defaultView="table"
      storageKey={REPORTS_VIEW}
      loading={loading}
      selectedRowId={selectedId}
      onRowActivate={(r) => onSelect(r.id)}
      emptyState={<>No reports recorded yet.</>}
    />
  );
}

/**
 * Tab / build attribution badges, lifted verbatim from the old `ReportRow`.
 * A standalone component because `FieldDef.cell` is a plain `(row) => ReactNode`
 * and cannot call hooks itself.
 */
function AttributionBadges({ report: c }: { report: Report }) {
  const tabId = getTabId();
  const { serverBuildId } = useStaleFrontend();
  return (
    <>
      {c.lastClientId != null &&
        (c.lastClientId === tabId ? (
          <Badge variant="info">this tab</Badge>
        ) : (
          <Badge variant="muted">another tab</Badge>
        ))}
      {c.lastBuildId != null &&
        serverBuildId != null &&
        c.lastBuildId !== serverBuildId && (
          <Badge variant="warning">outdated tab</Badge>
        )}
    </>
  );
}
