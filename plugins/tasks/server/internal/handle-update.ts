import { updateTask } from "@plugins/tasks-core/server";

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string | null;
    drop?: boolean;
    hold?: boolean;
    expanded?: boolean;
    parentId?: string | null;
    rank?: string;
  };
  let row;
  try {
    row = await updateTask(id, body);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Bad request", {
      status: 400,
    });
  }
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json(row);
}
