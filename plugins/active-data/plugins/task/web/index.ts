import type { PluginDefinition } from "@core";
import { ActiveData } from "@plugins/active-data/web";
import { TaskCard } from "./components/task-card";

export default {
  id: "active-data-task",
  name: "Active Data: task card",
  description:
    "Renders <task>prompt</task> tags as editable cards with Create + Launch actions. Models suggest tasks inline; users tweak and act without leaving the transcript.",
  contributions: [ActiveData.Tag({ tag: "task", component: TaskCard })],
} satisfies PluginDefinition;
