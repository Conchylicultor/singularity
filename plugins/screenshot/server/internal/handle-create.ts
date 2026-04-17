import { put } from "./store";

export async function handleCreate(req: Request): Promise<Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/png")) {
    return new Response("expected content-type: image/png", { status: 400 });
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return new Response("empty body", { status: 400 });
  }
  const id = put(bytes);
  return Response.json({ id });
}
