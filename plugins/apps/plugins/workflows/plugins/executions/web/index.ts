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
      label: "Executions",
      // The pane's only section, and the Run button lives inside its body —
      // collapsed by default would leave the definition page with one shut bar
      // and no way to run anything without a click. Seeds the persisted state
      // only, so a user who closes it keeps it closed.
      useDefaultOpen: () => true,
      component: ExecutionsSection,
    }),
    Pane.Register({ pane: executionDetailPane }),
  ],
} satisfies PluginDefinition;
