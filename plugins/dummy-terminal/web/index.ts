import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { TerminalSquare } from "lucide-react";
import { TerminalList } from "./components/terminal-list";

const dummyTerminalPlugin: PluginDefinition = {
  id: "dummy-terminal",
  name: "Dummy Terminal",
  contributions: [
    Shell.Sidebar({
      title: "Terminal",
      icon: TerminalSquare,
      component: TerminalList,
    }),
  ],
};

export default dummyTerminalPlugin;
