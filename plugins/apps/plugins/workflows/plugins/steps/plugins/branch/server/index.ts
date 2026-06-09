import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { branchExecutor } from "./internal/executor";

export default {
  description:
    "Branch step type for workflows. Routes execution based on a field value from the previous step's output.",
  register: [branchExecutor],
} satisfies ServerPluginDefinition;
