import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(tmpdir(), "singularity-screenshots");

export async function handleSaveFile(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });
  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    return new Response("invalid id", { status: 400 });
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/png")) {
    return new Response("expected content-type: image/png", { status: 400 });
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return new Response("empty body", { status: 400 });
  }
  await mkdir(DIR, { recursive: true });
  const path = join(DIR, `${id}.png`);
  await Bun.write(path, bytes);
  return Response.json({ path });
}
