import {
  Pane,
  PaneChrome,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { reportsRootRoute, reportDetailRoute } from "@plugins/reports/core";
import { ReportsView } from "./components/reports-view";
import { ReportDetail } from "./components/report-detail";
import { useReport } from "./internal/use-report";

// Panes are declared first so their types are known before the component
// bodies reference them. Component identifiers below are function
// declarations (hoisted), so the forward reference is safe at runtime.

export const reportsPane = Pane.define({
  route: reportsRootRoute,
  app: debugApp,
  component: ReportsBody,
});

function useResolveReport({ reportId }: { reportId: string }): {
  pending: boolean;
  found: boolean;
} {
  const read = useReport(reportId);
  switch (read.status) {
    case "found":
      return { pending: false, found: true };
    case "missing":
      return { pending: false, found: false };
    // A failed read must not discard a deep link: it stays pending and the
    // body renders what broke.
    case "pending":
    case "error":
      return { pending: true, found: false };
  }
}

export const reportDetailPane = Pane.define({
  route: reportDetailRoute,
  app: debugApp,
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
        onSelect={(id) =>
          openPane(reportDetailPane, { reportId: id }, { mode: "push" })
        }
      />
    </PaneChrome>
  );
}

function ReportDetailBody() {
  return <ReportDetail />;
}
