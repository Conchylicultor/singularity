import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdSmartToy } from "react-icons/md";
import { SessionList } from "./components/session-list";

const claudeSessionsPlugin: PluginDefinition = {
  id: "claude-sessions",
  name: "Claude Sessions",
  contributions: [
    Shell.Sidebar({
      title: "Claude Sessions",
      icon: MdSmartToy,
      component: SessionList,
    }),
  ],
};

export default claudeSessionsPlugin;
