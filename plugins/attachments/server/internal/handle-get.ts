import { stat } from "node:fs/promises";
import { getAttachment } from "./api";

export async function handleGet(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });

  const row = await getAttachment(id);
  if (!row) return new Response("not found", { status: 404 });

  try {
    await stat(row.diskPath);
  } catch {
    return new Response("file missing on disk", { status: 410 });
  }

  const file = Bun.file(row.diskPath);
  return new Response(file, {
    headers: {
      "content-type": row.mime,
      "content-disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
