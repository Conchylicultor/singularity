import { put } from "./store";

export async function handleCreate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/png")) {
    return new Response("expected content-type: image/png", { status: 400 });
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return new Response("empty body", { status: 400 });
  }
  put(id, bytes);
  return Response.json({ id });
}
