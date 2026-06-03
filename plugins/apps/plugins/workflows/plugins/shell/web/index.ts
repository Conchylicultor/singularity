import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdSchema } from "react-icons/md";
import { WorkflowsLayout } from "./components/workflows-layout";

export { WorkflowsApp } from "./slots";

export default {
  name: "Workflows: Shell",
  description:
    "App shell for the workflows app. Registers the /workflows app entry and defines WorkflowsApp.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      id: "workflows",
      icon: MdSchema,
      tooltip: "Workflows",
      component: WorkflowsLayout,
      path: "/workflows",
    }),
  ],
} satisfies PluginDefinition;
