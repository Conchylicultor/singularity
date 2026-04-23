import { Pane } from "@plugins/pane/web";
import { EventsTestView } from "./components/events-test-view";

export const eventsTestPane = Pane.define({
  id: "events-test",
  path: "/events-test",
  component: EventsTestView,
});
