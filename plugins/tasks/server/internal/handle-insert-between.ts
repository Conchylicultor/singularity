import {
  createTask,
  getTask,
  removeTaskDependency,
  addTaskDependency,
} from "@plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { insertTaskBetween } from "../../core/endpoints";
import { withNotifyBatch } from "@server/resources";

export const handleInsertBetween = implement(insertTaskBetween, async ({ body }) => {
  const { sourceTaskId, targetTaskId, targetParentId } = body;

  const [sourceTask, targetTask] = await Promise.all([
    getTask(sourceTaskId),
    getTask(targetTaskId),
  ]);

  const groupId = sourceTask?.groupId ?? targetTask?.groupId ?? null;

  return withNotifyBatch(async () => {
    const row = await createTask({
      parentId: targetParentId ?? null,
      groupId,
      title: "Untitled",
      author: "user",
    });
    await removeTaskDependency(targetTaskId, sourceTaskId);
    await addTaskDependency(targetTaskId, row.id);
    return row;
  });
});
