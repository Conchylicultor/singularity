import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdDashboardCustomize } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { prototypesApp } from "../core";
import { PrototypesLayout } from "./components/prototypes-layout";

export default {
  description:
    "App shell for Prototypes. Registers the /prototypes app entry and renders the gallery + Focus/Compare detail panes in a Miller layout.",
  contributions: [
    Apps.App({
      id: prototypesApp.id,
      icon: mdAppIcon(MdDashboardCustomize),
      tooltip: "Prototypes",
      component: PrototypesLayout,
      path: prototypesApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
