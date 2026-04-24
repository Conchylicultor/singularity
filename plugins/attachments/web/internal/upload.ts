export interface UploadedAttachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

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
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload failed (${res.status}): ${text}`);
  }
  return (await res.json()) as UploadedAttachment;
}
