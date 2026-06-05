import { implement } from "@plugins/infra/plugins/endpoints/server";
import { putTaskPreprompt, deleteTaskPreprompt } from "../../shared/endpoints";
import { setTaskPreprompt } from "./mutations";

export const handlePutTaskPreprompt = implement(putTaskPreprompt, async ({ params, body }) => {
  await setTaskPreprompt(params.taskId, body.prepromptId);
  return { ok: true };
});

export const handleDeleteTaskPreprompt = implement(deleteTaskPreprompt, async ({ params }) => {
  await setTaskPreprompt(params.taskId, null);
  return { ok: true };
});
