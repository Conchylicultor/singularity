import { implement } from "@plugins/infra/plugins/endpoints/server";
import { createPromptBlockTask } from "../../shared/endpoints";
import { createTaskFromPromptBlock } from "./mutations";

export const handleCreatePromptBlockTask = implement(
  createPromptBlockTask,
  async ({ body }) => createTaskFromPromptBlock(body),
);
