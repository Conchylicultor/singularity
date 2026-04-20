import { createTask } from "@plugins/tasks-core/server";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    parentId?: string | null;
    title?: string;
    author?: string;
  };
  const row = await createTask({
    parentId: body.parentId ?? null,
    title: body.title ?? "Untitled",
    author: body.author ?? "user",
  });
  return Response.json(row);
}
