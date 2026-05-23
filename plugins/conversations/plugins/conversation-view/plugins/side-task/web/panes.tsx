import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { tasksResource } from "@plugins/tasks/core";
import { SideTaskBody } from "./components/side-task-body";

function useResolveTask({ taskId }: { taskId: string }) {
  const result = useResource(tasksResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((t) => t.id === taskId) };
}

export const taskSidePane = Pane.define({
  id: "task-side",
  segment: "task/:taskId",
  input: type<{ convId: string }>(),
  component: SideTaskBody,
  chrome: {
    history: false,
    promote: false,
  },
  resolve: useResolveTask,
});
