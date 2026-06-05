import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdHome } from "react-icons/md";
import { HomeLayout } from "./components/home-layout";

export { Home } from "./slots";

export default {
  name: "Home: Shell",
  description:
    "App shell for Home. Registers the /home app entry and defines the Home.Section slot.",
  contributions: [
    Apps.App({
      id: "home",
      icon: MdHome,
      tooltip: "Home",
      component: HomeLayout,
      path: "/home",
    }),
  ],
} satisfies PluginDefinition;
