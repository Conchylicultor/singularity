import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { TasksPane } from "./components/tasks-pane";

export const convTasksPane = Pane.define({
  id: "conv-tasks",
  segment: "tp",
  input: type<{ convId: string }>(),
  component: TasksPane,
  chrome: { history: false },
});
