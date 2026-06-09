import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdExtension } from "react-icons/md";
import { StudioLayout } from "./components/studio-layout";

export { Studio } from "./slots";

export default {
  description:
    "App shell for Studio. Registers the /studio app entry and defines Studio.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: "studio",
      icon: MdExtension,
      tooltip: "Studio",
      component: StudioLayout,
      path: "/studio",
    }),
  ],
} satisfies PluginDefinition;
