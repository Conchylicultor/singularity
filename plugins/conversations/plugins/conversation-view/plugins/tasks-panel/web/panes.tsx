import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { tasksResource } from "@plugins/tasks/core";
import { TasksPane } from "./components/tasks-pane";

function useResolveTask({ taskId }: { taskId: string }) {
  const result = useResource(tasksResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((t) => t.id === taskId) };
}

export const convTasksPane = Pane.define({
  id: "conv-tasks",
  segment: "tp/:taskId",
  component: TasksPane,
  chrome: { history: false },
  resolve: useResolveTask,
});
