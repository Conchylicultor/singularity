import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdHome } from "react-icons/md";
import { homeApp } from "../core";
import { HomeLayout } from "./components/home-layout";

export { Home } from "./slots";

export default {
  description:
    "App shell for Home. Registers the /home app entry and defines the Home.Section slot.",
  contributions: [
    Apps.App({
      id: homeApp.id,
      icon: MdHome,
      tooltip: "Home",
      component: HomeLayout,
      path: homeApp.basePath,
      default: true,
    }),
  ],
} satisfies PluginDefinition;
