import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdCloud } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { deployApp } from "../core";
import { DeployLayout } from "./components/deploy-layout";

export { Deploy } from "./slots";

export default {
  description: "App shell for the deploy platform.",
  contributions: [
    Apps.App({
      id: deployApp.id,
      icon: mdAppIcon(MdCloud),
      tooltip: "Deploy",
      component: DeployLayout,
      path: deployApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
