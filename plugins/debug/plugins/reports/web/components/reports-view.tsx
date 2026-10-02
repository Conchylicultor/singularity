import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { getTabId } from "@plugins/primitives/plugins/scope/plugins/tab-id/web";
import { useStaleFrontend } from "@plugins/build/web";
import { reportsList, REPORTS_SEARCHABLE } from "@plugins/reports/core";
import type { Report } from "@plugins/reports/core";
import { Reports } from "@plugins/reports/web";
import {
  DataView,
  defineDataView,
  liveDataSource,
} from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
// It IS `reportsList`'s column scope (asserted at mount): the surface whose
// custom columns sort and filter the live window.
const REPORTS_VIEW = defineDataView("debug.reports");

// The live source: every report, a segmented window of which is ever loaded
// here. Sort / filter / search compile to SQL server-side; a new report, a
// repeat moving a count, a noise flip or a linked task reaches the tuples
// holding that row through the reports producer — no tick, no refetch. The
// kind / source filter options are the facets: read live as a grouping of the
// whole table (not the loaded rows), value-sorted, so a new kind appears in its
// alphabetical place.
const reportsSource = liveDataSource(reportsList, {
  searchable: REPORTS_SEARCHABLE,
  facets: ["kind", "source"],
});

export function ReportsView({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <DataView<Report>
      fields={fields}
      views={["table", "list"]}
      defaultView="table"
      storageKey={REPORTS_VIEW}
      selectedRowId={selectedId}
      onRowActivate={(r) => onSelect(r.id)}
      emptyState={<>No reports recorded yet.</>}
      source={reportsSource}
    />
  );
}

// Static: the field schema derives nothing from the loaded rows. `kind` and
// `source` declare no `options` — their option lists are the source's facets.
const fields: FieldDef<Report>[] = [
  {
    id: "kind",
    label: "Kind",
    type: "enum",
    value: (r) => r.kind,
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
    id: "lastSeenAt",
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
    // `value` is the human message (search runs server-side, over the
    // message / kind / fingerprint); the visible cell routes through the
    // per-kind slot.
    value: (r) => r.message,
    cell: (r) => <Reports.KindView.Dispatch report={r} />,
    primary: true,
    sortable: false,
    width: "minmax(0,2fr)",
  },
];

/**
 * Tab / build attribution badges, lifted verbatim from the old `ReportRow`.
 * A standalone component because `FieldDef.cell` is a plain `(row) => ReactNode`
 * and cannot call hooks itself.
 */
function AttributionBadges({ report: c }: { report: Report }) {
  const tabId = getTabId();
  const { serverGraph } = useStaleFrontend();
  return (
    <>
      {c.lastClientId != null &&
        (c.lastClientId === tabId ? (
          <Badge variant="info">this tab</Badge>
        ) : (
          <Badge variant="muted">another tab</Badge>
        ))}
      {c.lastBuildId != null &&
        serverGraph != null &&
        c.lastBuildId !== serverGraph && (
          <Badge variant="warning">outdated tab</Badge>
        )}
    </>
  );
}
