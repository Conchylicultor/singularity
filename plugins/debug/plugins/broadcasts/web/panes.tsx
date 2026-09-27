import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BroadcastsPanel } from "./components/broadcasts-panel";

export const broadcastsPane = Pane.define({
  title: "Broadcasts",
  route: defineRoute({
    id: "debug-broadcasts",
    segment: "broadcasts",
  }),
  app: debugApp,
  component: BroadcastsBody,
});

function BroadcastsBody() {
  return (
    <PaneChrome pane={broadcastsPane}>
      <BroadcastsPanel />
    </PaneChrome>
  );
}
