import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdSubject } from "react-icons/md";
import { LogsSidebar } from "./components/logs-sidebar";

const logsPlugin: PluginDefinition = {
  id: "logs",
  name: "Logs",
  contributions: [
    Shell.Sidebar({
      title: "Logs",
      icon: MdSubject,
      component: LogsSidebar,
    }),
  ],
};

export default logsPlugin;
