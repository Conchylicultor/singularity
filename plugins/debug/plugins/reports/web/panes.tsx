import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ReportsView } from "./components/reports-view";

export const reportsPane = Pane.define({
  id: "reports",
  segment: "reports",
  component: ReportsBody,
});

function ReportsBody() {
  return (
    <PaneChrome pane={reportsPane} title="Reports">
      <ReportsView />
    </PaneChrome>
  );
}
