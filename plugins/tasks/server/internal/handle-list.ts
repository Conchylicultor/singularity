import { listTasks as listTasksDb } from "@plugins/tasks/plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listTasks } from "../../core/endpoints";

export const handleList = implement(listTasks, async () => {
  return listTasksDb();
});
