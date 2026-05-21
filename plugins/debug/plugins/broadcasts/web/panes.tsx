import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { BroadcastsPanel } from "./components/broadcasts-panel";

export const broadcastsPane = Pane.define({
  id: "debug-broadcasts",
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
