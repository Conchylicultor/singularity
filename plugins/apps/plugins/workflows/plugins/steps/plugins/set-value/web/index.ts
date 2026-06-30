import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Workflows } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { MdDataObject } from "react-icons/md";
import { SetValueConfig } from "./components/set-value-config";

export default {
  description:
    "Set-value step type for workflows. Emits a constant seed value (string or parsed JSON) as the step output, ignoring its input.",
  contributions: [
    Workflows.StepType({
      pluginId: "set-value",
      label: "Set Value",
      icon: MdDataObject,
      configComponent: SetValueConfig,
    }),
  ],
} satisfies PluginDefinition;
