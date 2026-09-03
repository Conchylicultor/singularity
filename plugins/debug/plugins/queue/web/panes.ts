import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { QueueView } from "./components/queue-view";

const queueRoute = defineRoute({
  id: "queue",
  segment: "queue",
});

export const queuePane = Pane.define({
  route: queueRoute,
  app: debugApp,
  component: QueueView,
});
