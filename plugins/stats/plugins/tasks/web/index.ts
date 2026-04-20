import type { PluginDefinition } from "@core";
import { Stats } from "@plugins/stats/web";
import { TasksCumulativeChart } from "./components/tasks-cumulative-chart";

export default {
  id: "stats-tasks",
  name: "Stats: Tasks",
  description: "Task-based stats: active (open) tasks over time.",
  contributions: [
    Stats.Chart({
      id: "tasks-active",
      title: "Active tasks over time",
      component: TasksCumulativeChart,
    }),
  ],
} satisfies PluginDefinition;
