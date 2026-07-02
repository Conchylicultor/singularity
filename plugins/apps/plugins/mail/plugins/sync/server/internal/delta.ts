import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  getProfile,
  listLabels,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import { GmailHistoryExpiredError } from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import {
  _mailSyncState,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { MAX_CONSECUTIVE_RESYNCS } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { ATTACHMENT_SCAN_DELTA_WINDOW_DAYS } from "../../core";
import { backfillJob } from "./backfill";
import { upsertLabels } from "./store";
import { applyHistorySince } from "./history-sync";
import { attachmentScanJob } from "./attachment-scan";
import { classifyMailSyncError } from "./classify-error";
import { recordSyncError } from "./record-error";

// Incremental delta via Gmail `history.list` from the stored historyId
// watermark. On a stale-watermark 404 (GmailHistoryExpiredError) we fall back to
// a bounded full resync (re-enter "backfilling" from a fresh profile historyId).
// Records are applied idempotently; label changes are handled by re-fetching the
// affected messages and re-upserting (which reconciles labels + flags + thread)
// rather than hand-patching deltas — simpler and idempotent.

export const deltaJob = defineJob({
  name: "mail.delta",
  input: z.object({ accountId: z.string() }),
  event: z.never(),
  dedup: { key: ({ accountId }) => accountId },
  maxAttempts: 5,
  run: async ({ input }) => {
    const { accountId } = input;

    const [state] = await db
      .select({
        status: _mailSyncState.status,
        historyId: _mailSyncState.historyId,
        resyncCount: _mailSyncState.resyncCount,
      })
      .from(_mailSyncState)
      .where(eq(_mailSyncState.accountId, accountId))
      .limit(1);
    if (!state || state.status === "backfilling" || state.historyId == null) {
      return;
    }

    try {
      const { accessToken: token } = await requireGmailToken();

      // Keep label names/colors current and the message↔label FK satisfiable.
      await upsertLabels(accountId, await listLabels(token));

      // Consume history from the watermark, applying every record and advancing
      // the watermark (shared with the self-renewing backfill).
      let applied: { historyId: string; addedIds: string[] };
      try {
        applied = await applyHistorySince(token, accountId, state.historyId);
      } catch (err) {
        if (!(err instanceof GmailHistoryExpiredError)) throw err;
        // Watermark too old — Gmail dropped the history. Count this expiry-driven
        // resync; a genuine loop (backfilling→delta→404 with delta never
        // succeeding) climbs this counter monotonically until it trips.
        const nextResync = (state.resyncCount ?? 0) + 1;
        if (nextResync >= MAX_CONSECUTIVE_RESYNCS) {
          // Too many consecutive expiries with no successful delta in between —
          // the mailbox can't be backfilled before Gmail's window elapses.
          // Escalate to a terminal error (the tick only enqueues delta for
          // delta/idle accounts, so this breaks the loop) instead of resyncing.
          const now = new Date();
          await db
            .update(_mailSyncState)
            .set({
              status: "error",
              errorCode: "resync_loop",
              lastError:
                `Mailbox re-synced ${nextResync} times without catching up — ` +
                `Gmail's history window keeps expiring before backfill completes.`,
              lastErrorAt: now,
              resyncCount: nextResync,
              updatedAt: now,
            })
            .where(eq(_mailSyncState.accountId, accountId));
          return;
        }
        // Below threshold — bounded full resync from a fresh profile historyId.
        // Clear any prior error (this is a recovery, not a failure) but carry the
        // incremented resync count so consecutive expiries accumulate.
        const profile = await getProfile(token);
        await db
          .update(_mailSyncState)
          .set({
            historyId: profile.historyId,
            status: "backfilling",
            errorCode: null,
            lastError: null,
            lastErrorAt: null,
            resyncCount: nextResync,
            updatedAt: new Date(),
          })
          .where(eq(_mailSyncState.accountId, accountId));
        await backfillJob.enqueue({ accountId });
        return;
      }

      // Advance the watermark even when there were zero records (it may have
      // moved server-side). Clear any prior error on a successful delta.
      await db
        .update(_mailSyncState)
        .set({
          historyId: applied.historyId,
          status: "delta",
          lastDeltaSyncAt: new Date(),
          errorCode: null,
          lastError: null,
          lastErrorAt: null,
          // A successful delta proves the watermark is fresh — reset the loop.
          resyncCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(_mailSyncState.accountId, accountId));

      // New mail may carry attachments — pre-populate the paperclip for the
      // freshly-arrived (recent) envelopes without a body fetch. Skipped when the
      // delta added nothing, so an idle tick does no scan work.
      if (applied.addedIds.length > 0) {
        await attachmentScanJob.enqueue({
          accountId,
          windowDays: ATTACHMENT_SCAN_DELTA_WINDOW_DAYS,
        });
      }
    } catch (err) {
      // Persist + classify the failure (survives restart, pushes to the UI).
      // Terminal → dead-letter; transient → rethrow so graphile retries.
      await recordSyncError(accountId, err);
      const c = classifyMailSyncError(err);
      if (c.terminal) {
        throw new NonRetryableError(`mail.delta: ${c.message}`);
      }
      throw err;
    }
  },
});
