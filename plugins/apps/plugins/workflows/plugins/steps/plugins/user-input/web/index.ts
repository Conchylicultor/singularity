import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Workflows } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { MdEditNote } from "react-icons/md";
import { UserInputConfig } from "./components/user-input-config";
import { UserInputExecution } from "./components/user-input-execution";

export default {
  description:
    "Wait-for-user-input step type for workflows. Suspends execution and renders a form in the trace; resumes with the submitted data once a human fills it in.",
  contributions: [
    Workflows.StepType({
      pluginId: "user-input",
      label: "Wait for Input",
      icon: MdEditNote,
      configComponent: UserInputConfig,
      executionComponent: UserInputExecution,
    }),
  ],
} satisfies PluginDefinition;
