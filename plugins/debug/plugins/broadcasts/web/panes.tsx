import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BroadcastsPanel } from "./components/broadcasts-panel";

const broadcastsRoute = defineRoute({
  id: "debug-broadcasts",
  segment: "broadcasts",
});

export const broadcastsPane = Pane.define({
  route: broadcastsRoute,
  app: debugApp,
  component: BroadcastsBody,
});

function BroadcastsBody() {
  return (
    <PaneChrome pane={broadcastsPane} title="Broadcasts">
      <BroadcastsPanel />
    </PaneChrome>
  );
}
