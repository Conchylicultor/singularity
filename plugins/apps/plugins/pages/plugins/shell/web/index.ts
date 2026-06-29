import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdDescription } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { pagesApp } from "../core";
import { PagesLayout } from "./components/pages-layout";

export { Pages } from "./slots";

export default {
  description:
    "App shell for Pages. Registers the /pages app entry and defines the Pages.Sidebar slot.",
  contributions: [
    Apps.App({
      id: pagesApp.id,
      icon: mdAppIcon(MdDescription),
      tooltip: "Pages",
      component: PagesLayout,
      path: pagesApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
