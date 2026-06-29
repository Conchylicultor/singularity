import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdSchema } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WorkflowsApp } from "@plugins/apps/plugins/workflows/plugins/shell/web";
import { WorkflowsSidebar } from "./components/workflows-sidebar";
import { definitionsRootPane, definitionDetailPane } from "./panes";

export { WorkflowsDetail } from "./slots";
export { definitionsRootPane, definitionDetailPane } from "./panes";

export default {
  description:
    "Sidebar list, welcome pane, and detail pane (editable name/description, read-only step list, extensible WorkflowsDetail.Section slot) for the Workflows app.",
  contributions: [
    WorkflowsApp.Sidebar({ id: "definitions", title: "Workflows", icon: MdSchema, component: WorkflowsSidebar }),
    Pane.Register({ pane: definitionsRootPane }),
    Pane.Register({ pane: definitionDetailPane }),
  ],
} satisfies PluginDefinition;
