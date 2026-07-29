import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { PromptOriginSection } from "./components/prompt-origin-section";

export default {
  description:
    "Origin backlink in the task detail: the page a `/prompt`-block-launched task came from, as a clickable chip opening pageDetailPane. Renders nothing when the task has no prompt-block link or the page is gone.",
  contributions: [
    TaskDetailSlots.Section({
      id: "prompt-origin",
      label: "Origin",
      component: PromptOriginSection,
    }),
  ],
} satisfies PluginDefinition;
