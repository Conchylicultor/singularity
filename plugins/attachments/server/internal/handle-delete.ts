import { deleteAttachment } from "./operations";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });
  const ok = await deleteAttachment(id);
  if (!ok) return new Response("not found", { status: 404 });
  return new Response(null, { status: 204 });
}
