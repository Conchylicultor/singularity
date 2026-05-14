import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { STATUS_META, StatusIcon, StatusBadge } from "./components/task-status";

export default {
  id: "task-status",
  name: "Task: Status",
  description:
    "Single source of truth for TaskStatus display metadata — icon, label, icon color, and badge style.",
} satisfies PluginDefinition;
