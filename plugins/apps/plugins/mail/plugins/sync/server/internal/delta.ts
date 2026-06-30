import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  batchGetMessages,
  getProfile,
  listHistory,
  listLabels,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import {
  GmailHistoryExpiredError,
  type GmailHistoryRecord,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import {
  _mailSyncState,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { backfillJob } from "./backfill";
import { deleteMessage, upsertLabels, upsertMessage } from "./store";
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

      // Paginate history from the watermark, collecting every record.
      const records: GmailHistoryRecord[] = [];
      let newHistoryId = state.historyId;
      let pageToken: string | undefined;
      try {
        do {
          const page = await listHistory(token, {
            startHistoryId: state.historyId,
            pageToken,
          });
          records.push(...(page.history ?? []));
          newHistoryId = page.historyId;
          pageToken = page.nextPageToken;
        } while (pageToken);
      } catch (err) {
        if (!(err instanceof GmailHistoryExpiredError)) throw err;
        // Watermark too old — Gmail dropped the history. Bounded full resync
        // from a fresh profile historyId. Clear any prior error (this is a
        // recovery, not a failure).
        const profile = await getProfile(token);
        await db
          .update(_mailSyncState)
          .set({
            historyId: profile.historyId,
            status: "backfilling",
            errorCode: null,
            lastError: null,
            lastErrorAt: null,
            updatedAt: new Date(),
          })
          .where(eq(_mailSyncState.accountId, accountId));
        await backfillJob.enqueue({ accountId });
        return;
      }

      // Collect the message ids to (re)fetch and the ones to delete. Re-fetch
      // covers messagesAdded AND label changes (labelsAdded/labelsRemoved) — the
      // upsert reconciles labels/flags/thread, so we never hand-apply a delta.
      const toFetch = new Set<string>();
      const toDelete = new Set<string>();
      for (const rec of records) {
        for (const a of rec.messagesAdded ?? []) toFetch.add(a.message.id);
        for (const c of rec.labelsAdded ?? []) toFetch.add(c.message.id);
        for (const c of rec.labelsRemoved ?? []) toFetch.add(c.message.id);
        for (const d of rec.messagesDeleted ?? []) toDelete.add(d.message.id);
      }
      // A message deleted in this same window must not be re-fetched.
      for (const id of toDelete) toFetch.delete(id);

      if (toFetch.size > 0) {
        const msgs = await batchGetMessages(token, [...toFetch]);
        for (const m of msgs) await upsertMessage(accountId, m);
      }
      for (const id of toDelete) await deleteMessage(id);

      // Advance the watermark even when there were zero records (it may have
      // moved server-side). Clear any prior error on a successful delta.
      await db
        .update(_mailSyncState)
        .set({
          historyId: newHistoryId,
          status: "delta",
          lastDeltaSyncAt: new Date(),
          errorCode: null,
          lastError: null,
          lastErrorAt: null,
          updatedAt: new Date(),
        })
        .where(eq(_mailSyncState.accountId, accountId));
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
