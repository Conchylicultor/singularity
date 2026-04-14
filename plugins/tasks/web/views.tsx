import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { TasksPanel } from "./components/tasks-panel";

export function tasksPane(): PaneDescriptor {
  return { title: "Tasks", component: TasksPanel, path: "/tasks" };
}
