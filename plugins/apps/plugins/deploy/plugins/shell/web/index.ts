import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdCloud } from "react-icons/md";
import { deployApp } from "../core";
import { DeployLayout } from "./components/deploy-layout";

export { Deploy } from "./slots";

export default {
  description: "App shell for the deploy platform.",
  contributions: [
    Apps.App({
      id: deployApp.id,
      icon: MdCloud,
      tooltip: "Deploy",
      component: DeployLayout,
      path: deployApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
