import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BroadcastsPanel } from "./components/broadcasts-panel";

export const broadcastsPane = Pane.define({
  id: "debug-broadcasts",
  app: debugApp,
  segment: "broadcasts",
  component: BroadcastsBody,
});

function BroadcastsBody() {
  return (
    <PaneChrome pane={broadcastsPane} title="Broadcasts">
      <BroadcastsPanel />
    </PaneChrome>
  );
}
