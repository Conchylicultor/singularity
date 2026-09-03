import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { EmitPane } from "./components/emit-pane";

const liveStateEmitRoute = defineRoute({
  id: "debug-live-state-emit",
  segment: "live-state-emit",
});

export const liveStateEmitPane = Pane.define({
  route: liveStateEmitRoute,
  app: debugApp,
  component: LiveStateEmitBody,
});

function LiveStateEmitBody(): ReactElement {
  return (
    <PaneChrome pane={liveStateEmitPane} title="Live-State Emit">
      <EmitPane />
    </PaneChrome>
  );
}
