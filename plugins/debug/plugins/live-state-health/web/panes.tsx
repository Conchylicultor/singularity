import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { LiveStateHealth } from "./components/live-state-health";

export const liveStateHealthPane = Pane.define({
  id: "live-state-health",
  app: debugApp,
  segment: "live-state",
  component: LiveStateHealthBody,
});

function LiveStateHealthBody(): ReactElement {
  return (
    <PaneChrome pane={liveStateHealthPane} title="Live State">
      <LiveStateHealth />
    </PaneChrome>
  );
}
