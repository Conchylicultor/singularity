import type { ServerPluginDefinition } from "@server/types";

export {
  generateTaskTitle,
  scheduleTaskTitleUpdate,
  synthesiseTitleFallback,
} from "./internal/generate-title";

export default {
  id: "tasks-task-title",
  name: "Tasks: Task Title",
  description:
    "Haiku-backed task title generation. Synthesises an instant first-line fallback; upgrades asynchronously so task creation never blocks on the Claude CLI round-trip.",
} satisfies ServerPluginDefinition;
