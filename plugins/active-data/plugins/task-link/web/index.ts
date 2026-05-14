import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData } from "@plugins/active-data/web";
import { TaskLinkChip } from "./components/task-link-chip";
import { TASK_ID_RE } from "./internal/pattern";

export { TaskLinkChip };

export default {
  id: "active-data-task-link",
  name: "Active Data: task link chip",
  description:
    "Renders raw `task-<id>` strings inline as clickable chips that open the task detail pane. Models emit the bare id, no tag wrapping needed.",
  contributions: [ActiveData.Tag({ display: "inline", pattern: TASK_ID_RE, component: TaskLinkChip })],
} satisfies PluginDefinition;
