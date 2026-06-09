import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { uploadAttachment } from "../../shared/endpoints";
import { createAttachment } from "./operations";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// Multipart/form-data upload: expects a `file` field (File blob). Creates an
// _attachments row with no link yet; callers link the returned id from their
// own submit path by inserting into the appropriate `<owner>_attachments`
// table (see `Attachments.defineLink`). Orphan sweep collects unlinked rows
// past TTL.
export const handleUpload = implement(uploadAttachment, async ({ body: form }) => {
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new HttpError(400, "missing file field");
  }
  if (file.size === 0) {
    throw new HttpError(400, "empty file");
  }
  if (file.size > MAX_SIZE) {
    throw new HttpError(413, `file too large (max ${MAX_SIZE} bytes)`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const att = await createAttachment(
    bytes,
    file.name || `upload-${crypto.randomUUID()}`,
    file.type || "application/octet-stream",
  );

  return {
    id: att.id,
    filename: att.filename,
    mime: att.mime,
    size: att.size,
  };
});
