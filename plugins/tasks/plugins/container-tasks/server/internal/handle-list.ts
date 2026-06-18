import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listContainerTaskIds } from "@plugins/tasks/plugins/container-tasks/core";
import { containerTaskIdSet } from "./guard";

export const handleListContainerTaskIds = implement(
  listContainerTaskIds,
  async () => ({ ids: [...containerTaskIdSet()] }),
);
