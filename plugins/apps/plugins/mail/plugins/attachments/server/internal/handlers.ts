import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { createAttachment } from "@plugins/infra/plugins/attachments/server";
import { getAttachment } from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import {
  _mailAttachments,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import {
  mailAttachmentDownloadEndpoint,
  mailAttachmentUrl,
} from "../../core";

// Lazy Gmail attachment blob download. The sync engine stores attachment
// *metadata* at hydration (filename / mime / size / gmailAttachmentId) but never
// downloads the bytes. This handler fetches the bytes on demand and caches them:
//
// - Cache hit (`storedAttachmentId` already set): return its same-origin URL with
//   NO Gmail round-trip.
// - Cache miss: resolve a Gmail token, fetch the bytes via `getAttachment`, mint
//   an `infra/attachments` blob (`createAttachment`), stamp the row's
//   `storedAttachmentId`, and return the URL. Idempotent — a concurrent second
//   request re-fetches at worst (a harmless duplicate blob); the last stamp wins.
//
// A Gmail/token failure propagates loudly (no silent fallback); a missing row is
// a 404.
export const handleMailAttachmentDownload = implement(
  mailAttachmentDownloadEndpoint,
  async ({ body }) => {
    const [row] = await db
      .select()
      .from(_mailAttachments)
      .where(eq(_mailAttachments.id, body.attachmentRowId))
      .limit(1);
    if (!row) {
      throw new HttpError(
        404,
        `Attachment ${body.attachmentRowId} is not in the local mailbox`,
      );
    }

    if (row.storedAttachmentId) {
      return {
        storedAttachmentId: row.storedAttachmentId,
        url: mailAttachmentUrl(row.storedAttachmentId),
      };
    }

    const { accessToken } = await requireGmailToken();
    const { data } = await getAttachment(
      accessToken,
      row.messageId,
      row.gmailAttachmentId,
    );
    const stored = await createAttachment(data, row.filename, row.mimeType);
    await db
      .update(_mailAttachments)
      .set({ storedAttachmentId: stored.id, updatedAt: new Date() })
      .where(eq(_mailAttachments.id, row.id));

    return { storedAttachmentId: stored.id, url: mailAttachmentUrl(stored.id) };
  },
);
