import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { TaskLaunchApply } from "./internal/contribution";
export type {
  TaskLaunchContext,
  TaskLaunchApplyEntry,
} from "./internal/contribution";

export default {
  description:
    "Server half of the task launch-option registry: each option contributes how its drafted value is applied to a newly created task, so the chain endpoint applies them generically.",
  contributions: [],
} satisfies ServerPluginDefinition;
