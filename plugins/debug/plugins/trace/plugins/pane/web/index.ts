import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdBolt, MdList } from "react-icons/md";
import { slowEventsPane, traceDetailPane } from "./panes";
import { SlowEvents } from "./slots";
import { EventsView } from "./components/events-view";

export { SlowEvents } from "./slots";
export { slowEventsPane, traceDetailPane } from "./panes";
export {
  groupIncidents,
  incidentColorClass,
  type IncidentInfo,
} from "./internal/incidents";
export { IncidentBadge } from "./components/incident-badge";

export default {
  description:
    "Debug → Slow Events: the tabbed pane host (Events list + detail Gantt) over the durable trace store, and the SlowEvents.View tab slot the Slow Ops aggregate/cluster views merge into.",
  contributions: [
    Pane.Register({ pane: slowEventsPane }),
    Pane.Register({ pane: traceDetailPane }),
    SlowEvents.View({
      id: "events",
      title: "Events",
      icon: MdList,
      order: 10,
      component: EventsView,
    }),
    DebugApp.Sidebar({
      id: "trace-slow-events",
      ...sidebarNavItem({
        title: "Slow Events",
        icon: MdBolt,
        onClick: () => openPane(slowEventsPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
