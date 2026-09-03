import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { LiveStateHealth } from "./components/live-state-health";

const liveStateHealthRoute = defineRoute({
  id: "live-state-health",
  segment: "live-state",
});

export const liveStateHealthPane = Pane.define({
  route: liveStateHealthRoute,
  app: debugApp,
  component: LiveStateHealthBody,
});

function LiveStateHealthBody(): ReactElement {
  return (
    <PaneChrome pane={liveStateHealthPane} title="Live State">
      <LiveStateHealth />
    </PaneChrome>
  );
}
