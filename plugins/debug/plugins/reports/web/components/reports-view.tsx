import { useMemo } from "react";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { getTabId } from "@plugins/primitives/plugins/scope/plugins/tab-id/web";
import { useStaleFrontend } from "@plugins/build/web";
import {
  fetchEndpoint,
  useEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
import { queryReports, reportFacets } from "@plugins/reports/core";
import type { Report, ReportFacets } from "@plugins/reports/core";
import { Reports } from "@plugins/reports/web";
import {
  DataView,
  defineDataView,
} from "@plugins/primitives/plugins/data-view/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import {
  useRefetchOnReportsRevision,
  useReportsChangeTick,
} from "../internal/revision";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const REPORTS_VIEW = defineDataView("debug.reports");

// The rows are server-paged (POST /api/reports/query), so only a window is ever
// loaded here. Sort / filter / search compile to SQL server-side; every
// sortable/filterable field id below must match a key of the server's
// COLUMN_MAP (plugins/reports/server/internal/handle-query.ts).
export function ReportsView({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const changeTick = useReportsChangeTick();
  // The enum filter options: every kind / source in the table, not just the
  // loaded page. Refetched in place when the tick moves.
  const facets = useEndpoint(reportFacets, {});
  useRefetchOnReportsRevision(facets.refetch);
  // While the facets are unknown the enum fields carry no option list — never an
  // empty one, which would claim the table has no kinds.
  const fields = useReportFields(facets.data);

  return (
    <DataView<Report>
      rows={[]}
      fields={fields}
      rowKey={(r) => r.id}
      views={["table", "list"]}
      defaultView="table"
      storageKey={REPORTS_VIEW}
      selectedRowId={selectedId}
      onRowActivate={(r) => onSelect(r.id)}
      emptyState={<>No reports recorded yet.</>}
      dataSource={{
        changeTick,
        fetchPage: (args) => fetchEndpoint(queryReports, {}, { body: args }),
      }}
    />
  );
}

function useReportFields(facets: ReportFacets | undefined): FieldDef<Report>[] {
  return useMemo(() => {
    const optionsOf = (values: string[] | undefined) =>
      values?.map((v) => ({ value: v, label: v }));

    return [
      {
        id: "kind",
        label: "Kind",
        type: "enum",
        value: (r) => r.kind,
        options: optionsOf(facets?.kinds),
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
        options: optionsOf(facets?.sources),
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
          r.rateLimited ? (
            <Badge variant="destructive">rate-limited</Badge>
          ) : null,
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
            <span className="tabular-nums text-muted-foreground">
              ×{r.count}
            </span>
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
  }, [facets]);
}

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
