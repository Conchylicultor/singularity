import { Pane } from "@plugins/primitives/plugins/pane/web";
import { QueueView } from "./components/queue-view";

export const queuePane = Pane.define({
  id: "queue",
  after: [null],
  segment: "debug/queue",
  component: QueueView,
});
