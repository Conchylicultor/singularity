import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  getProfile,
  listMessages,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import { GmailHistoryExpiredError } from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import {
  _mailSyncState,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import {
  BACKFILL_WINDOW_DAYS,
  MAX_BACKFILL_MESSAGES,
} from "../../core";
import { upsertMessageEnvelope } from "./store";
import { fetchEnvelopes } from "./fetch-envelopes";
import { applyHistorySince } from "./history-sync";
import { attachmentScanJob } from "./attachment-scan";
import { classifyMailSyncError } from "./classify-error";
import { recordSyncError } from "./record-error";

// Bounded, metadata-only backfill — the on-demand ("instant") sync model. Rather
// than mirroring the ENTIRE mailbox with full bodies, each run lists one
// `messages.list` page WITHIN a recent window (`newer_than:${BACKFILL_WINDOW_DAYS}d`)
// and fetches only ENVELOPES (`format=metadata`: headers + snippet + labels, no
// body). Bodies are hydrated lazily on first open (see `hydrate.ts`). The Gmail
// pageToken + a running envelope count are carried in the job INPUT (durable in
// the graphile row), so a crash resumes the exact page and the cap survives.
//
// The backfill ends — flipping sync_state to "delta" — as soon as EITHER bound
// trips: the window is exhausted (no `nextPageToken`) OR `MAX_BACKFILL_MESSAGES`
// envelopes have been synced. This is what makes connect feel instant on a large
// mailbox: seconds of metadata, not an hours-long full-body crawl.
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
  input: z.object({
    accountId: z.string(),
    pageToken: z.string().optional(),
    // Envelopes synced so far across this backfill chain (for the hard cap).
    syncedCount: z.number().optional(),
  }),
  event: z.never(),
  dedup: { key: ({ accountId }) => accountId },
  maxAttempts: 5,
  run: async ({ input }) => {
    const { accountId, pageToken, syncedCount = 0 } = input;

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

      // Metadata-only, windowed list: only envelopes within the recent window are
      // fetched (bodies are hydrated on-demand). The `q` filter carries across
      // pages via the pageToken.
      const list = await listMessages(token, {
        pageToken,
        q: `newer_than:${BACKFILL_WINDOW_DAYS}d`,
        maxResults: 100,
      });

      const ids = (list.messages ?? []).map((m) => m.id);
      // Tolerant of a freshly-listed id that 404s (deleted in the race between
      // list and get) — one vanished message must not dead-letter the backfill.
      const { fetched } = await fetchEnvelopes(token, ids);
      for (const m of fetched) {
        await upsertMessageEnvelope(accountId, m);
      }
      const newSyncedCount = syncedCount + ids.length;
      const capReached = newSyncedCount >= MAX_BACKFILL_MESSAGES;

      // Renew the watermark for this page (armed by bootstrap/resync, so never
      // null while backfilling — the `?? null` guard is defensive).
      const renewedHistoryId = await renewWatermark(
        token,
        accountId,
        state.historyId ?? null,
      );

      // Continue only while the window has more pages AND the cap is not hit.
      if (list.nextPageToken && !capReached) {
        await db
          .update(_mailSyncState)
          .set({ historyId: renewedHistoryId, updatedAt: new Date() })
          .where(eq(_mailSyncState.accountId, accountId));
        await backfillJob.enqueue({
          accountId,
          pageToken: list.nextPageToken,
          syncedCount: newSyncedCount,
        });
        return;
      }

      if (capReached && list.nextPageToken) {
        Log.emit(
          "mail-sync",
          `backfill hit the ${MAX_BACKFILL_MESSAGES}-envelope cap for ` +
            `${accountId}; older mail loads on-demand.`,
          "stdout",
        );
      }

      // Final page (window exhausted or cap reached): the watermark was renewed
      // each page, so it is already fresh — the first delta starts from it with
      // no stale-history gap. Flip into steady-state delta and clear any prior
      // error.
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

      // Pre-populate the attachment indicator for the mirrored window without a
      // body fetch (Gmail `has:attachment`, decoupled + idempotent so a scan
      // failure never dead-letters the backfill).
      await attachmentScanJob.enqueue({
        accountId,
        windowDays: BACKFILL_WINDOW_DAYS,
      });
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
    return (await applyHistorySince(token, accountId, currentHistoryId))
      .historyId;
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
