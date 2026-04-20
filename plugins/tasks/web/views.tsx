import type { PaneDescriptor } from "@plugins/shell/web";
import { TasksPanel } from "./components/tasks-panel";

export function tasksPane(args?: { id?: string }): PaneDescriptor {
  const Component = () => <TasksPanel selectedId={args?.id} />;
  const path = args?.id ? `/tasks/${args.id}` : "/tasks";
  return { title: "Tasks", component: Component, path };
}
