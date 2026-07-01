import {
  batchGetMessages,
  listHistory,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import type { GmailHistoryRecord } from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import { deleteMessage, upsertMessage } from "./store";

// Shared history-consumption pass used by BOTH the steady-state delta and the
// self-renewing backfill: paginate `history.list` from a watermark, apply every
// record idempotently, and return the advanced watermark. Label changes are
// handled by re-fetching the affected messages and re-upserting (the upsert
// reconciles labels + flags + thread) rather than hand-patching deltas.
//
// A stale-watermark 404 propagates as `GmailHistoryExpiredError` (from
// `listHistory`) so each caller keeps its own recovery policy — delta escalates
// via the resync-loop counter; backfill re-arms from a fresh profile and
// continues. Keeping this pure of recovery logic is what lets both reuse it.

/**
 * Consume Gmail history from `startHistoryId` forward, applying every record to
 * the local mirror, and return the new (advanced) historyId watermark.
 *
 * Throws `GmailHistoryExpiredError` if Gmail has dropped the history for
 * `startHistoryId` (the caller must full-resync).
 */
export async function applyHistorySince(
  token: string,
  accountId: string,
  startHistoryId: string,
): Promise<string> {
  // Paginate history from the watermark, collecting every record.
  const records: GmailHistoryRecord[] = [];
  let newHistoryId = startHistoryId;
  let pageToken: string | undefined;
  do {
    const page = await listHistory(token, { startHistoryId, pageToken });
    records.push(...(page.history ?? []));
    newHistoryId = page.historyId;
    pageToken = page.nextPageToken;
  } while (pageToken);

  // Collect the message ids to (re)fetch and the ones to delete. Re-fetch covers
  // messagesAdded AND label changes (labelsAdded/labelsRemoved) — the upsert
  // reconciles labels/flags/thread, so we never hand-apply a delta.
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

  return newHistoryId;
}
