import { listHistory } from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import type { GmailHistoryRecord } from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import { deleteMessage, upsertMessageEnvelope } from "./store";
import { fetchEnvelopes } from "./fetch-envelopes";

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
 * the local mirror, and return the new (advanced) historyId watermark plus the
 * ids of the freshly-added messages (from `messagesAdded`, for a targeted
 * attachment scan).
 *
 * Throws `GmailHistoryExpiredError` if Gmail has dropped the history for
 * `startHistoryId` (the caller must full-resync).
 */
export async function applyHistorySince(
  token: string,
  accountId: string,
  startHistoryId: string,
): Promise<{ historyId: string; addedIds: string[] }> {
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
  // messagesAdded AND label changes (labelsAdded/labelsRemoved) — the metadata
  // upsert reconciles labels/flags/thread, so we never hand-apply a delta. It is
  // deliberately metadata-only: a newly-arrived message lands as an envelope stub
  // (body fetched on first open), and a label change on an already-hydrated
  // message preserves its cached body.
  const toFetch = new Set<string>();
  const toDelete = new Set<string>();
  const addedIds = new Set<string>();
  for (const rec of records) {
    for (const a of rec.messagesAdded ?? []) {
      toFetch.add(a.message.id);
      addedIds.add(a.message.id);
    }
    for (const c of rec.labelsAdded ?? []) toFetch.add(c.message.id);
    for (const c of rec.labelsRemoved ?? []) toFetch.add(c.message.id);
    for (const d of rec.messagesDeleted ?? []) toDelete.add(d.message.id);
  }
  // A message deleted in this same window must not be re-fetched.
  for (const id of toDelete) toFetch.delete(id);

  if (toFetch.size > 0) {
    const { fetched, missing } = await fetchEnvelopes(token, [...toFetch]);
    for (const m of fetched) await upsertMessageEnvelope(accountId, m);
    // A 404 on re-fetch means the message was deleted after its history record
    // was written — reconcile it as a deletion alongside the explicit ones.
    for (const id of missing) toDelete.add(id);
  }
  for (const id of toDelete) await deleteMessage(id);

  return { historyId: newHistoryId, addedIds: [...addedIds] };
}
