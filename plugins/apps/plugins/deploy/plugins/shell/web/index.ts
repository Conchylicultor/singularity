import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdCloud } from "react-icons/md";
import { DeployLayout } from "./components/deploy-layout";

export { Deploy } from "./slots";

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
    }),
  ],
} satisfies PluginDefinition;
