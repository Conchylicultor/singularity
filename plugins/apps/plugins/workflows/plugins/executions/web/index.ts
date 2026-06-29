import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WorkflowsDetail } from "@plugins/apps/plugins/workflows/plugins/definitions/web";
import { ExecutionsSection } from "./components/executions-section";
import { executionDetailPane } from "./panes";

export default {
  description:
    "Executions section (run list + Run button) for the Workflows detail pane, plus the execution-detail pane rendering the per-step trace.",
  contributions: [
    WorkflowsDetail.Section({
      id: "executions",
      title: "Executions",
      order: 10,
      component: ExecutionsSection,
    }),
    Pane.Register({ pane: executionDetailPane }),
  ],
} satisfies PluginDefinition;
