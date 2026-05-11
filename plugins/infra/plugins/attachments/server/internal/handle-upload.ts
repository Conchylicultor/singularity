import { db } from "@plugins/database/server";
import { _attachments } from "./tables";
import { diskPathFor, ensureAttachmentsRoot } from "./paths";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// Multipart/form-data upload: expects a `file` field (File blob). Creates an
// _attachments row with no link yet; callers link the returned id from their
// own submit path by inserting into the appropriate `<owner>_attachments`
// table (see `Attachments.defineLink`). Orphan sweep collects unlinked rows
// past TTL.
export async function handleUpload(req: Request): Promise<Response> {
  const ctype = req.headers.get("content-type") ?? "";
  if (!ctype.toLowerCase().includes("multipart/form-data")) {
    return new Response("expected multipart/form-data", { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("invalid multipart body", { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response("missing file field", { status: 400 });
  }
  if (file.size === 0) {
    return new Response("empty file", { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return new Response(`file too large (max ${MAX_SIZE} bytes)`, { status: 413 });
  }

  await ensureAttachmentsRoot();
  const id = crypto.randomUUID();
  const filename = file.name || `upload-${id}`;
  const mime = file.type || "application/octet-stream";
  const diskPath = diskPathFor(id, filename);

  const bytes = new Uint8Array(await file.arrayBuffer());
  await Bun.write(diskPath, bytes);

  const [row] = await db
    .insert(_attachments)
    .values({
      id,
      filename,
      mime,
      size: file.size,
      diskPath,
    })
    .returning();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return new Response("failed to record attachment", { status: 500 });
  return Response.json({
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
  });
}
