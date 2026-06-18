import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { HealthMonitorPanel } from "./components/health-monitor-panel";

export const healthMonitorPane = Pane.define({
  id: "debug-health-monitor",
  segment: "health",
  component: HealthMonitorBody,
});

function HealthMonitorBody(): ReactElement {
  return (
    <PaneChrome pane={healthMonitorPane} title="Health Monitor">
      <HealthMonitorPanel />
    </PaneChrome>
  );
}
