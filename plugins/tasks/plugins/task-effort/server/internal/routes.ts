import { implement } from "@plugins/infra/plugins/endpoints/server";
import { putTaskEffort, deleteTaskEffort } from "../../shared/endpoints";
import { setTaskEffort } from "./mutations";

export const handlePutTaskEffort = implement(putTaskEffort, async ({ params, body }) => {
  await setTaskEffort(params.taskId, body.level);
});

export const handleDeleteTaskEffort = implement(deleteTaskEffort, async ({ params }) => {
  await setTaskEffort(params.taskId, null);
});
