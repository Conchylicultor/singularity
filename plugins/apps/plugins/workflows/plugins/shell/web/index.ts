import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdSchema } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { workflowsApp } from "../core";
import { WorkflowsLayout } from "./components/workflows-layout";
import { WorkflowsApp } from "./slots";

export { WorkflowsApp } from "./slots";

export default {
  description:
    "App shell for the workflows app. Registers the /workflows app entry and defines WorkflowsApp.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      app: workflowsApp,
      icon: mdAppIcon(MdSchema),
      component: WorkflowsLayout,
    }),
  ],
  slots: WorkflowsApp,
} satisfies PluginDefinition;
