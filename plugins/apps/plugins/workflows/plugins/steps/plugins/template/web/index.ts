import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Workflows } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { MdTransform } from "react-icons/md";
import { TemplateConfig } from "./components/template-config";

export default {
  description:
    "Template step type for workflows. Renders a {{ expr }} template against the previous step's output and emits the result (string or parsed JSON).",
  contributions: [
    Workflows.StepType({
      pluginId: "template",
      label: "Template",
      icon: MdTransform,
      configComponent: TemplateConfig,
    }),
  ],
} satisfies PluginDefinition;
