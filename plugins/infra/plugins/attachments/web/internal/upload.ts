import type { z } from "zod";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  uploadAttachment as uploadAttachmentEndpoint,
  type UploadedAttachmentSchema,
} from "../../shared/endpoints";

export type UploadedAttachment = z.infer<typeof UploadedAttachmentSchema>;

// Staged upload: POSTs a file to /api/attachments. Server stores bytes, creates
// a row with owner_id = NULL, returns the id. Caller must then link it to an
// owner via POST /api/attachments/:id/attach (or a higher-level submit endpoint
// that does it server-side).
export async function uploadAttachment(
  file: File | Blob,
  filename: string,
  mime: string,
): Promise<UploadedAttachment> {
  const form = new FormData();
  const fileObj = file instanceof File ? file : new File([file], filename, { type: mime });
  form.append("file", fileObj, filename);
  return fetchEndpoint(uploadAttachmentEndpoint, {}, { body: form });
}
