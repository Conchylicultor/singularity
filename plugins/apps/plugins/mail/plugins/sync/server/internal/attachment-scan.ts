import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { listMessages } from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import { requireGmailToken } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { MAX_ATTACHMENT_SCAN_PAGES } from "../../core";
import { markMessagesWithAttachments } from "./store";

// Pre-populate the attachment (paperclip) indicator WITHOUT a body fetch. Gmail's
// `has:attachment` search operator is the authoritative metadata-only signal —
// the same "real, non-inline attachment" classification behind Gmail's own
// paperclip. Listing `q=… has:attachment` returns only id refs (cheap, no
// per-message GET), which we intersect with the local mirror via the positive-only
// `markMessagesWithAttachments`. This fills the gap left by `format=metadata`
// ingestion (no MIME parts → attachment unknown until hydration).

/**
 * Page `messages.list?q=<q> has:attachment` (id-only) within a window and mark the
 * mirrored messages as having an attachment. Bounded by `MAX_ATTACHMENT_SCAN_PAGES`.
 */
export async function scanAttachmentFlags(
  token: string,
  accountId: string,
  q: string,
): Promise<void> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const list = await listMessages(token, {
      q: `${q} has:attachment`,
      pageToken,
      maxResults: 500,
    });
    for (const m of list.messages ?? []) ids.push(m.id);
    pageToken = list.nextPageToken;
    pages += 1;
    if (pages >= MAX_ATTACHMENT_SCAN_PAGES && pageToken) {
      Log.emit(
        "mail-sync",
        `attachment scan hit the ${MAX_ATTACHMENT_SCAN_PAGES}-page cap for ` +
          `${accountId}; remaining attachment flags fill on open.`,
        "stdout",
      );
      break;
    }
  } while (pageToken);

  await markMessagesWithAttachments(accountId, ids);
}

export const attachmentScanJob = defineJob({
  name: "mail.attachment-scan",
  input: z.object({ accountId: z.string(), windowDays: z.number() }),
  event: z.never(),
  dedup: { key: ({ accountId }) => accountId },
  maxAttempts: 3,
  run: async ({ input }) => {
    const { accountId, windowDays } = input;
    const { accessToken: token } = await requireGmailToken();
    await scanAttachmentFlags(token, accountId, `newer_than:${windowDays}d`);
  },
});
