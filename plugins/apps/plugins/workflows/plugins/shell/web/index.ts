import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdSchema } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { workflowsApp } from "../core";
import { WorkflowsLayout } from "./components/workflows-layout";

export { WorkflowsApp } from "./slots";

export default {
  description:
    "App shell for the workflows app. Registers the /workflows app entry and defines WorkflowsApp.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: workflowsApp.id,
      icon: mdAppIcon(MdSchema),
      tooltip: "Workflows",
      component: WorkflowsLayout,
      path: workflowsApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
