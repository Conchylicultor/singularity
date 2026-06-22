import { defineRoute } from "@plugins/primitives/plugins/pane/core";

export const tasksRootRoute = defineRoute({ id: "tasks-root", segment: "tasks" });

export const taskDetailRoute = defineRoute({
  id: "task-detail",
  segment: "t/:taskId",
  parent: tasksRootRoute,
});
