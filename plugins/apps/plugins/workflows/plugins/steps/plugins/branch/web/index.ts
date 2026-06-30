import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Workflows } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { MdAltRoute } from "react-icons/md";
import { BranchConfig } from "./components/branch-config";
import { BranchExecution } from "./components/branch-execution";

export default {
  description:
    "Branch step type for workflows. Routes execution based on a field value from the previous step's output.",
  contributions: [
    Workflows.StepType({
      pluginId: "branch",
      label: "Branch",
      icon: MdAltRoute,
      configComponent: BranchConfig,
      executionComponent: BranchExecution,
    }),
  ],
} satisfies PluginDefinition;
