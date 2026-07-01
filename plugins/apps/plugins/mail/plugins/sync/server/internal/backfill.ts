import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  batchGetMessages,
  getProfile,
  listMessages,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import { GmailHistoryExpiredError } from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import {
  _mailSyncState,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { upsertMessage } from "./store";
import { applyHistorySince } from "./history-sync";
import { classifyMailSyncError } from "./classify-error";
import { recordSyncError } from "./record-error";

// Whole-mailbox backfill, one `messages.list` page per run. The Gmail pageToken
// is carried in the job INPUT (durable in the graphile row) rather than the DB,
// so a crash resumes the exact page on retry and no schema column is needed.
// Each page is idempotent via the storage layer's upserts. The job re-enqueues
// itself for the next page and flips sync_state to "delta" on the final page.
//
// Self-renewing watermark: on every page we ALSO consume `history.list` from the
// current watermark forward (`applyHistorySince`) and persist the advanced
// historyId. This keeps the watermark within one page-interval of fresh, so a
// long backfill can never outlive Gmail's history-retention window — the root
// cause of the stale-historyId resync loop. It also captures in-flight new
// messages/label-changes that `messages.list` (newest-first, paging downward)
// would otherwise skip.

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
      .select({
        status: _mailSyncState.status,
        historyId: _mailSyncState.historyId,
      })
      .from(_mailSyncState)
      .where(eq(_mailSyncState.accountId, accountId))
      .limit(1);
    if (!state || state.status !== "backfilling") return;

    try {
      // Fresh token every run — tokens expire; central owns refresh. A
      // token-unavailable failure here is recorded + classified like any other.
      const { accessToken: token } = await requireGmailToken();

      const list = await listMessages(token, { pageToken, maxResults: 100 });

      const ids = (list.messages ?? []).map((m) => m.id);
      const msgs = await batchGetMessages(token, ids);
      for (const m of msgs) {
        await upsertMessage(accountId, m);
      }

      // Renew the watermark for this page (armed by bootstrap/resync, so never
      // null while backfilling — the `?? null` guard is defensive).
      const renewedHistoryId = await renewWatermark(
        token,
        accountId,
        state.historyId ?? null,
      );

      if (list.nextPageToken) {
        await db
          .update(_mailSyncState)
          .set({ historyId: renewedHistoryId, updatedAt: new Date() })
          .where(eq(_mailSyncState.accountId, accountId));
        await backfillJob.enqueue({ accountId, pageToken: list.nextPageToken });
        return;
      }

      // Final page: the watermark was renewed each page, so it is already fresh —
      // the first delta starts from it with no stale-history gap. Flip into
      // steady-state delta and clear any prior error.
      await db
        .update(_mailSyncState)
        .set({
          historyId: renewedHistoryId,
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

/**
 * Advance the watermark for one backfill page by consuming history from it, with
 * a bounded recovery if it has (exceptionally) expired mid-backfill.
 *
 * A 404 here is extremely narrow: the backfill stalled longer than Gmail's
 * history-retention window *between two pages* (e.g. a crash + long-delayed
 * retry). Re-arm from a fresh `profile.historyId` and continue the backfill —
 * the stall's in-flight changes reconcile on the next full resync. Any other
 * error propagates to the job's outer handler (transient → retry the page).
 */
async function renewWatermark(
  token: string,
  accountId: string,
  currentHistoryId: string | null,
): Promise<string> {
  if (currentHistoryId == null) {
    // Defensive: no watermark to advance from — fall back to a fresh profile.
    return (await getProfile(token)).historyId;
  }
  try {
    return await applyHistorySince(token, accountId, currentHistoryId);
  } catch (err) {
    if (!(err instanceof GmailHistoryExpiredError)) throw err;
    const profile = await getProfile(token);
    Log.emit(
      "mail-sync",
      `backfill watermark expired mid-backfill for ${accountId}; ` +
        `re-armed from profile historyId ${profile.historyId}`,
      "stderr",
    );
    return profile.historyId;
  }
}
