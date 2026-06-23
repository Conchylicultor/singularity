import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { reportsRootRoute, reportDetailRoute, reportsResource } from "@plugins/reports/core";
import { ReportsView } from "./components/reports-view";
import { ReportDetail } from "./components/report-detail";

// Panes are declared first so their types are known before the component
// bodies reference them. Component identifiers below are function
// declarations (hoisted), so the forward reference is safe at runtime.

export const reportsPane = Pane.define({
  route: reportsRootRoute,
  component: ReportsBody,
});

function useResolveReport({ reportId }: { reportId: string }) {
  const result = useResource(reportsResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((r) => r.id === reportId) };
}

export const reportDetailPane = Pane.define({
  route: reportDetailRoute,
  component: ReportDetailBody,
  width: 480,
  resolve: useResolveReport,
});

function ReportsBody() {
  const openPane = useOpenPane();
  const selectedId = reportDetailPane.useRouteEntry()?.params.reportId;

  return (
    <PaneChrome pane={reportsPane} title="Reports">
      <ReportsView
        selectedId={selectedId}
        onSelect={(id) => openPane(reportDetailPane, { reportId: id }, { mode: "push" })}
      />
    </PaneChrome>
  );
}

function ReportDetailBody() {
  return <ReportDetail />;
}
