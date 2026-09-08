import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { HealthMonitorPanel } from "./components/health-monitor-panel";

export const healthMonitorPane = Pane.define({
  route: defineRoute({ id: "debug-health-monitor", segment: "health" }),
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
