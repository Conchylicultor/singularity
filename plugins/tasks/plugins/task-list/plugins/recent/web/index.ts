import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdHistory } from "react-icons/md";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { TasksRecentView } from "./internal/tasks-recent-view";

export default {
  id: "tasks-list-recent",
  name: "Task List: Recent",
  description: "Recency-sorted flat task list tab.",
  contributions: [
    Tasks.View({
      id: "recent",
      title: "Recent",
      icon: MdHistory,
      order: 20,
      component: TasksRecentView,
    }),
  ],
} satisfies PluginDefinition;
