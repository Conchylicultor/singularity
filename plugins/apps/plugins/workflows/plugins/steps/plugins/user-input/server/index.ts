import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { userInputExecutor } from "./internal/executor";

export default {
  description:
    "Wait-for-user-input step type for workflows. Suspends execution until a human submits the form, then resumes with the submitted data as the step output.",
  register: [userInputExecutor],
} satisfies ServerPluginDefinition;
