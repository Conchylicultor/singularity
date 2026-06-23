import { defineRoute } from "@plugins/primitives/plugins/pane/core";

export const reportsRootRoute = defineRoute({ id: "reports", segment: "reports" });

export const reportDetailRoute = defineRoute({
  // `rep/` (not `r/`) because pane segment patterns must be globally unique and
  // build's run-detail pane already owns `r/:runId`.
  id: "report-detail",
  segment: "rep/:reportId",
  parent: reportsRootRoute,
});
