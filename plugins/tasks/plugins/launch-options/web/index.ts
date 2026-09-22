import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskLaunch as TaskLaunchSlots } from "./slots";

export { TaskLaunch } from "./slots";
export type {
  TaskLaunchOption,
  LaunchOptionPill,
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
export {
  LaunchOptionPills,
  type LaunchOptionPillsProps,
} from "./components/launch-option-pills";

export default {
  description:
    "Registry of task launch options — the controls that configure HOW an agent launches. Owns the tasks.launch-option slot rendered by BOTH the task detail's Prompt card and the task-draft popover, so an option is one plugin folder and appears on both surfaces.",
  contributions: [],
  slots: TaskLaunchSlots,
} satisfies PluginDefinition;
