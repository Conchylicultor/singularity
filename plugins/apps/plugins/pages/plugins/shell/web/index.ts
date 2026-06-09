import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdDescription } from "react-icons/md";
import { PagesLayout } from "./components/pages-layout";

export { Pages } from "./slots";

export default {
  description:
    "App shell for Pages. Registers the /pages app entry and defines Pages.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: "pages",
      icon: MdDescription,
      tooltip: "Pages",
      component: PagesLayout,
      path: "/pages",
    }),
  ],
} satisfies PluginDefinition;
