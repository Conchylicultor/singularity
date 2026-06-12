import { Pane } from "@plugins/primitives/plugins/pane/web";
import { EventsTestView } from "./components/events-test-view";

export const eventsTestPane = Pane.define({
  id: "events-test",
  segment: "events-test",
  component: EventsTestView,
});
