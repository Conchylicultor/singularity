import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdAccountTree } from "react-icons/md";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { TasksList } from "./tasks-list";

export { TasksList };

export default {
  description: "Tree-view tab for the task list.",
  contributions: [
    Tasks.View({
      id: "tree",
      title: "Tree",
      icon: MdAccountTree,
      order: 10,
      component: TasksList,
    }),
  ],
} satisfies PluginDefinition;
