import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { TaskLaunch } from "./slots";
export type {
  TaskLaunchOption,
  LaunchControlProps,
  LaunchBinding,
  LaunchOptionEntry,
  LaunchOptionInfo,
} from "./slots";
export {
  useLaunchOptionDefaults,
  launchOptionValue,
  pickKnownOptions,
} from "./internal/values";
export type { LaunchOptionValues } from "./internal/values";

export default {
  description:
    "Registry of task launch options — the controls that configure HOW an agent launches. Owns the tasks.launch-option slot rendered by BOTH the task detail's Prompt card and the task-draft popover, so an option is one plugin folder and appears on both surfaces.",
  contributions: [],
} satisfies PluginDefinition;
