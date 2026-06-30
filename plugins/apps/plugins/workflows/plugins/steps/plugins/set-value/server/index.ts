import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setValueExecutor } from "./internal/executor";

export default {
  description:
    "Set-value step type for workflows. Emits a constant seed value (string or parsed JSON) as the step output, ignoring its input.",
  register: [setValueExecutor],
} satisfies ServerPluginDefinition;
