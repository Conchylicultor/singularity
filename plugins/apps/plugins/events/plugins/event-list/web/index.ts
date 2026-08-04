import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdEventNote } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Events } from "@plugins/apps/plugins/events/plugins/shell/web";
import { eventListPane } from "./panes";

export { eventListPane } from "./panes";
export { EventList } from "./slots";

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
} satisfies PluginDefinition;
