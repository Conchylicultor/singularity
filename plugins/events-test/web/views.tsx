import type { PaneDescriptor } from "@plugins/shell/web";
import { EventsTestView } from "./components/events-test-view";

export function eventsTestPane(): PaneDescriptor {
  return {
    title: "Events Test",
    component: EventsTestView,
    path: "/events-test",
  };
}
