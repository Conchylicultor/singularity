import { deleteTask as deleteTaskDb } from "@plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteTask } from "../../core/endpoints";

export const handleDelete = implement(deleteTask, async ({ params }) => {
  let found;
  try {
    found = await deleteTaskDb(params.id);
  } catch (err) {
    throw new HttpError(409, err instanceof Error ? err.message : "Conflict");
  }
  if (!found) throw new HttpError(404, "Not found");
  // return undefined → implement() sends 204
});
