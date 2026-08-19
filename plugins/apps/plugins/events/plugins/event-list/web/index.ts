import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdEventNote } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Events } from "@plugins/apps/plugins/events/plugins/shell/web";
import { eventListPane } from "./panes";
import { EventList } from "./slots";

export { eventListPane } from "./panes";
export { EventList } from "./slots";
// The one rendering of "an event, as a row", and the one answer to "where does
// an event open". Exported so a second events surface (the run pane's extracted
// events) shows the same row and opens the same destination, instead of a
// near-copy that drifts. Both are this plugin's own internal files — a re-export
// of another plugin's symbol would be the boundary violation, this is not.
export { EventRow } from "./components/event-row";
export { useOpenEvent, useEventUrl } from "./internal/use-open-event";

export default {
  description:
    "The events DataView: a server-delegated keyset query over the events table rendered as list / table / gallery, with every typed field a filter and sort dimension and the saved views authored in config. Reachable from the Events sidebar.",
  contributions: [
    Pane.Register({ pane: eventListPane }),
    Events.Sidebar({
      id: "event-list",
      ...sidebarNavItem({
        title: "Events",
        icon: MdEventNote,
        onClick: () => openPane(eventListPane, {}, { mode: "root" }),
      }),
    }),
  ],
  slots: { ...EventList, "event-list": eventListPane },
} satisfies PluginDefinition;
