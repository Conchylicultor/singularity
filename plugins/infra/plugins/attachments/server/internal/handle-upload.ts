import { createAttachment } from "./operations";

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
  } catch (err) {
    if (!(err instanceof TypeError) && !(err instanceof SyntaxError)) throw err;
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

  const bytes = new Uint8Array(await file.arrayBuffer());
  const att = await createAttachment(
    bytes,
    file.name || `upload-${crypto.randomUUID()}`,
    file.type || "application/octet-stream",
  );

  return Response.json({
    id: att.id,
    filename: att.filename,
    mime: att.mime,
    size: att.size,
  });
}
