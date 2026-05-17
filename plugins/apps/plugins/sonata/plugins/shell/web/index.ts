import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdPiano } from "react-icons/md";
import { SonataLayout } from "./components/sonata-layout";

export { Sonata } from "./slots";

export default {
  id: "sonata-shell",
  name: "Sonata: Shell",
  description:
    "App shell for Sonata. Registers the /sonata app entry and defines the Sonata.Section slot.",
  contributions: [
    Apps.App({
      id: "sonata",
      icon: MdPiano,
      tooltip: "Sonata",
      component: SonataLayout,
      path: "/sonata",
    }),
  ],
} satisfies PluginDefinition;
