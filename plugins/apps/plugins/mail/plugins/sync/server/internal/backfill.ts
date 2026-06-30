import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  batchGetMessages,
  listMessages,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import {
  _mailSyncState,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { upsertMessage } from "./store";
import { classifyMailSyncError } from "./classify-error";
import { recordSyncError } from "./record-error";

// Whole-mailbox backfill, one `messages.list` page per run. The Gmail pageToken
// is carried in the job INPUT (durable in the graphile row) rather than the DB,
// so a crash resumes the exact page on retry and no schema column is needed.
// Each page is idempotent via the storage layer's upserts. The job re-enqueues
// itself for the next page and flips sync_state to "delta" on the final page.

export const backfillJob = defineJob({
  name: "mail.backfill",
  input: z.object({ accountId: z.string(), pageToken: z.string().optional() }),
  event: z.never(),
  dedup: { key: ({ accountId }) => accountId },
  maxAttempts: 5,
  run: async ({ input }) => {
    const { accountId, pageToken } = input;

    // Guard: only run while this account is actually backfilling (a concurrent
    // cancel / completion flips the status and this run no-ops).
    const [state] = await db
      .select({ status: _mailSyncState.status })
      .from(_mailSyncState)
      .where(eq(_mailSyncState.accountId, accountId))
      .limit(1);
    if (!state || state.status !== "backfilling") return;

    try {
      // Fresh token every run — tokens expire; central owns refresh. A
      // token-unavailable failure here is recorded + classified like any other.
      const token = await requireGmailToken();

      const list = await listMessages(token, { pageToken, maxResults: 100 });

      const ids = (list.messages ?? []).map((m) => m.id);
      const msgs = await batchGetMessages(token, ids);
      for (const m of msgs) {
        await upsertMessage(accountId, m);
      }

      if (list.nextPageToken) {
        await backfillJob.enqueue({ accountId, pageToken: list.nextPageToken });
        return;
      }

      // Final page: the watermark historyId was captured at bootstrap; leave it
      // so the first delta catches every change since. Flip into steady-state
      // delta and clear any prior error.
      await db
        .update(_mailSyncState)
        .set({
          status: "delta",
          lastFullSyncAt: new Date(),
          errorCode: null,
          lastError: null,
          lastErrorAt: null,
          updatedAt: new Date(),
        })
        .where(eq(_mailSyncState.accountId, accountId));
    } catch (err) {
      // Persist + classify the failure so it survives a restart and pushes to
      // the UI. A permanent permission/auth/contract failure can never succeed
      // on replay — dead-letter it instead of burning the retry budget; a
      // transient failure rethrows so graphile retries the page (idempotent).
      await recordSyncError(accountId, err);
      const c = classifyMailSyncError(err);
      if (c.terminal) {
        throw new NonRetryableError(`mail.backfill: ${c.message}`);
      }
      throw err;
    }
  },
});
