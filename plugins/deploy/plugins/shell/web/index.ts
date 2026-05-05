import type { PluginDefinition } from "@core";
import { Apps } from "@plugins/apps/web";
import { MdCloud } from "react-icons/md";
import { DeployLayout } from "./components/deploy-layout";
import { serversRootPane } from "@plugins/deploy/plugins/servers/web";

export default {
  id: "deploy-shell",
  name: "Deploy: Shell",
  description: "App shell for the deploy platform.",
  contributions: [
    Apps.App({
      id: "deploy",
      icon: MdCloud,
      tooltip: "Deploy",
      component: DeployLayout,
      path: "/deploy",
      onClick: () => serversRootPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
