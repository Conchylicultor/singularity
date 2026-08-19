import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdEvent } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { Apps } from "@plugins/apps-core/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { eventsApp } from "../core";
import { EventsLayout } from "./components/events-layout";
import { eventsRootPane } from "./panes";
import { Events } from "./slots";

export { Events } from "./slots";

export default {
  description:
    "App shell for Events. Registers the /events app entry, defines the Events.Sidebar slot, and renders the landing pane.",
  contributions: [
    Apps.App({
      app: eventsApp,
      icon: mdAppIcon(MdEvent),
      component: EventsLayout,
    }),
    Pane.Register({ pane: eventsRootPane }),
  ],
  slots: { ...Events, "events-root": eventsRootPane },
} satisfies PluginDefinition;
