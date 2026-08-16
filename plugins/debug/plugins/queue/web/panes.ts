import { Pane } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { QueueView } from "./components/queue-view";

export const queuePane = Pane.define({
  id: "queue",
  app: debugApp,
  segment: "queue",
  component: QueueView,
});
