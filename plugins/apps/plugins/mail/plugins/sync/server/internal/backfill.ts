import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  batchGetMessages,
  listMessages,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import { GmailApiError } from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import {
  _mailSyncState,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { upsertMessage } from "./store";

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

    // Fresh token every run — tokens expire; central owns refresh.
    const token = await requireGmailToken();

    let list;
    try {
      list = await listMessages(token, { pageToken, maxResults: 100 });
    } catch (err) {
      // A permanent permission/auth/contract failure can never succeed on
      // replay — dead-letter it after this attempt instead of burning retries.
      if (err instanceof GmailApiError && isDeterministic(err.status)) {
        throw new NonRetryableError(
          `mail.backfill: Gmail rejected listMessages (${err.status}): ${err.message}`,
        );
      }
      throw err;
    }

    const ids = (list.messages ?? []).map((m) => m.id);
    const msgs = await batchGetMessages(token, ids);
    for (const m of msgs) {
      await upsertMessage(accountId, m);
    }

    if (list.nextPageToken) {
      await backfillJob.enqueue({ accountId, pageToken: list.nextPageToken });
      return;
    }

    // Final page: the watermark historyId was captured at bootstrap; leave it so
    // the first delta catches every change since. Flip into steady-state delta.
    await db
      .update(_mailSyncState)
      .set({
        status: "delta",
        lastFullSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(_mailSyncState.accountId, accountId));
  },
});

/** 4xx that a retry can never fix (bad request / auth / permission). */
function isDeterministic(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}
