import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdDashboardCustomize } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { prototypesApp } from "../core";
import { PrototypesLayout } from "./components/prototypes-layout";

export default {
  description:
    "App shell for Prototypes. Registers the /prototypes app entry and renders the gallery + detail panes (Focus, and the sibling compare plugin's Compare stage) in a Miller layout.",
  contributions: [
    Apps.App({
      app: prototypesApp,
      icon: mdAppIcon(MdDashboardCustomize),
      component: PrototypesLayout,
    }),
  ],
} satisfies PluginDefinition;
