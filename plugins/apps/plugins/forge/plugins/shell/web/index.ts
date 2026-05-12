import type { PluginDefinition } from "@core";
import { Apps } from "@plugins/apps/web";
import { MdHardware } from "react-icons/md";
import { ForgeLayout } from "./components/forge-layout";

export { Forge } from "./slots";

export default {
  id: "forge-shell",
  name: "Forge: Shell",
  description:
    "App shell for Forge. Registers the /forge app entry and defines Forge.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: "forge",
      icon: MdHardware,
      tooltip: "Forge",
      component: ForgeLayout,
      path: "/forge",
    }),
  ],
} satisfies PluginDefinition;
