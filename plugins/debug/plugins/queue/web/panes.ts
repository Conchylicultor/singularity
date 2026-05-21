import { Pane } from "@plugins/primitives/plugins/pane/web";
import { QueueView } from "./components/queue-view";

export const queuePane = Pane.define({
  id: "queue",
  segment: "queue",
  component: QueueView,
});
