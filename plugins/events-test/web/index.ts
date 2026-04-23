import type { PluginDefinition } from "@core";
import { MdBolt } from "react-icons/md";
import { Shell, ShellCommands } from "@plugins/shell/web";
import { eventsTestPane } from "./views";

export default {
  id: "events-test",
  name: "Events Test",
  description: "Dummy UI for exercising the events plugin end-to-end.",
  contributions: [
    Shell.Sidebar({
      title: "Events Test",
      icon: MdBolt,
      group: "System",
      onClick: () => ShellCommands.OpenPane(eventsTestPane()),
    }),
    Shell.Route({ pattern: "/events-test", resolve: () => eventsTestPane() }),
  ],
} satisfies PluginDefinition;
