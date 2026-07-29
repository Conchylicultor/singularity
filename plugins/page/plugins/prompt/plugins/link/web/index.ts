import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useBlockPromptTasks, usePromptTaskLink } from "./hooks";
export { createPromptTask } from "./internal/api";
export type { PromptTaskLink, PromptTaskOrigin } from "../shared/schemas";

export default {
  description:
    "Task↔prompt-block link: reads the tasks a prompt block launched (useBlockPromptTasks) and the page/block a task came from (usePromptTaskLink), and creates a provenance-stamped task (createPromptTask). No UI of its own.",
} satisfies PluginDefinition;
