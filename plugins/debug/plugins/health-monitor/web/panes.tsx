import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { HealthMonitorPanel } from "./components/health-monitor-panel";

const healthMonitorRoute = defineRoute({
  id: "debug-health-monitor",
  segment: "health",
});

export const healthMonitorPane = Pane.define({
  route: healthMonitorRoute,
  app: debugApp,
  component: HealthMonitorBody,
});

function HealthMonitorBody(): ReactElement {
  return (
    <PaneChrome pane={healthMonitorPane} title="Health Monitor">
      <HealthMonitorPanel />
    </PaneChrome>
  );
}
