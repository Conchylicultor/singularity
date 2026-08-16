import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { EmitPane } from "./components/emit-pane";

export const liveStateEmitPane = Pane.define({
  id: "debug-live-state-emit",
  app: debugApp,
  segment: "live-state-emit",
  component: LiveStateEmitBody,
});

function LiveStateEmitBody(): ReactElement {
  return (
    <PaneChrome pane={liveStateEmitPane} title="Live-State Emit">
      <EmitPane />
    </PaneChrome>
  );
}
