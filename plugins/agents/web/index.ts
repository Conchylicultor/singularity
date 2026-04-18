import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { MdPrecisionManufacturing } from "react-icons/md";
import { agentsPane } from "./views";

const agentsPlugin: PluginDefinition = {
  id: "agents",
  name: "Agents",
  description: "Named agent definitions that launch conversations.",
  contributions: [
    Shell.Sidebar({
      title: "Agents",
      icon: MdPrecisionManufacturing,
      group: "System",
      onClick: () => ShellCommands.OpenPane(agentsPane()),
    }),
    Shell.Route({
      pattern: "/agents",
      resolve: () => agentsPane(),
    }),
    Shell.Route({
      pattern: "/agents/:id",
      resolve: (params) => agentsPane({ id: params.id }),
    }),
  ],
};

export default agentsPlugin;
