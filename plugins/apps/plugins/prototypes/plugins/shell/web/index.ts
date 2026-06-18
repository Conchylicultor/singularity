import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdDashboardCustomize } from "react-icons/md";
import { PrototypesLayout } from "./components/prototypes-layout";

export default {
  description:
    "App shell for Prototypes. Registers the /prototypes app entry and renders the gallery + Focus/Compare detail panes in a Miller layout.",
  contributions: [
    Apps.App({
      id: "prototypes",
      icon: MdDashboardCustomize,
      tooltip: "Prototypes",
      component: PrototypesLayout,
      path: "/prototypes",
    }),
  ],
} satisfies PluginDefinition;
