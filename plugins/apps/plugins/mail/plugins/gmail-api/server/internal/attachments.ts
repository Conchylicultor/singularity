import { gmailRequest } from "./request";

interface GmailAttachmentBody {
  size: number;
  data: string; // base64url of the attachment bytes
}

/**
 * Fetch one attachment's bytes via `users.messages.attachments.get`. Gmail
 * returns the data base64url-encoded; we decode to a `Uint8Array` for storage.
 * Stateless like the rest of this client — token in, bytes out.
 */
export async function getAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<{ data: Uint8Array }> {
  const body = await gmailRequest<GmailAttachmentBody>(
    token,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  // base64url → base64 → bytes.
  const b64 = body.data.replace(/-/g, "+").replace(/_/g, "/");
  return { data: Uint8Array.from(Buffer.from(b64, "base64")) };
}
