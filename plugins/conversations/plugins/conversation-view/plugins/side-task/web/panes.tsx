import { Pane, type } from "@plugins/primitives/plugins/pane/web";
import { SideTaskBody } from "./components/side-task-body";

export const taskSidePane = Pane.define({
  id: "task-side",
  segment: "task/:taskId",
  input: type<{ convId: string }>(),
  component: SideTaskBody,
  chrome: {
    history: false,
    promote: false,
  },
});
