import type { ServerPluginDefinition } from "@server/types";
import { branchExecutor } from "./internal/executor";

export default {
  id: "workflows-steps-branch",
  name: "Workflows Steps: Branch",
  description:
    "Branch step type for workflows. Routes execution based on a field value from the previous step's output.",
  register: [branchExecutor],
} satisfies ServerPluginDefinition;
