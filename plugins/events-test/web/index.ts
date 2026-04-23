import type { PluginDefinition } from "@core";
import { MdBolt } from "react-icons/md";
import { Shell } from "@plugins/shell/web";
import { eventsTestPane } from "./panes";

export { eventsTestPane } from "./panes";

export default {
  id: "events-test",
  name: "Events Test",
  description: "Dummy UI for exercising the events plugin end-to-end.",
  contributions: [
    Shell.Sidebar({
      title: "Events Test",
      icon: MdBolt,
      group: "System",
      onClick: () => eventsTestPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
