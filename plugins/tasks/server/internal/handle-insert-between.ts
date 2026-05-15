import {
  createTask,
  removeTaskDependency,
  addTaskDependency,
} from "@plugins/tasks-core/server";
import { withNotifyBatch } from "@server/resources";

interface InsertBetweenBody {
  sourceTaskId?: string;
  targetTaskId?: string;
  targetParentId?: string | null;
}

export async function handleInsertBetween(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as InsertBetweenBody;
  const { sourceTaskId, targetTaskId, targetParentId } = body;
  if (
    typeof sourceTaskId !== "string" ||
    typeof targetTaskId !== "string"
  ) {
    return new Response("Missing sourceTaskId or targetTaskId", { status: 400 });
  }

  const newTask = await withNotifyBatch(async () => {
    const row = await createTask({
      parentId: targetParentId ?? null,
      title: "Untitled",
      author: "user",
    });
    await removeTaskDependency(targetTaskId, sourceTaskId);
    await addTaskDependency(targetTaskId, row.id);
    return row;
  });

  return Response.json(newTask);
}
