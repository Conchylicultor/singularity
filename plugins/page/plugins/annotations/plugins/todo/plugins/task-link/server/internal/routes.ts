import { implement } from "@plugins/infra/plugins/endpoints/server";
import { createTodoBlockTask } from "../../shared/endpoints";
import { ensureTodoTask } from "./mutations";

export const handleCreateTodoBlockTask = implement(
  createTodoBlockTask,
  async ({ params, body }) => ensureTodoTask(params.blockId, body.context),
);
