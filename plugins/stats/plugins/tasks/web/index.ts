import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Stats } from "@plugins/stats/web";
import { TasksSection } from "./components/tasks-section";

export default {
  name: "Stats: Tasks",
  description: "Task-based stats: active (open) tasks over time.",
  contributions: [
    Stats.Chart({
      id: "tasks-active",
      title: "Tasks",
      component: TasksSection,
    }),
  ],
} satisfies PluginDefinition;
