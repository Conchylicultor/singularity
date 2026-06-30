import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { templateExecutor } from "./internal/executor";

export default {
  description:
    "Template step type for workflows. Renders a {{ expr }} template against the previous step's output and emits the result (string or parsed JSON).",
  register: [templateExecutor],
} satisfies ServerPluginDefinition;
