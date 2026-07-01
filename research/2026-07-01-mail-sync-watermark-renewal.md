# Mail sync — self-renewing watermark during backfill

## Problem

The Gmail sync `historyId` watermark is captured **before** a backfill starts
(bootstrap, and delta.ts's 404-expiry recovery). `backfill.ts` flips
`status → delta` on its final page but never touches `historyId`. For a mailbox
large/slow enough that Gmail's history-retention window elapses before the
backfill finishes, the first delta after completion `404`s immediately →
another full backfill → loop. The `resyncCount` escalation caps the loop but
does not prevent it.

## Why the naive "refresh at completion" is UNSAFE

The task suggested re-fetching `profile.historyId` on the final page and using
that as the post-backfill watermark, on the premise that "backfill is a full
`messages.list` snapshot."

That premise is false. `messages.list` is **not** a point-in-time snapshot:

- It returns messages **newest-first**, and backfill pages from newest → oldest.
- Pagination is a downward-moving cursor. A **new message arriving during
  backfill** lands at the *top* (above page 1, which we already passed), so it is
  **never returned** by any later page. Backfill misses it.
- If we then set the watermark to `profile.historyId` (captured at the end,
  which is *after* that message's historyId), the subsequent `history.list`
  starts *past* the message → delta never returns it either.
- **Net: the message is silently lost** until the next full resync.

This is exactly why Google's "synchronizing clients" guidance — and the current
code — capture the watermark **before** the full sync: correctness requires a
watermark no newer than the moment the newest page was fetched. There is no free
lunch: a fresh (post-backfill) watermark and completeness are in direct tension
for a single-shot backfill-then-delta design.

## The fix: self-renewing backfill (interleaved history catch-up)

Keep capturing the watermark before backfill, but **renew it on every backfill
page** by consuming `history.list` from the current watermark forward and
applying those records (the same idempotent upsert/delete the delta uses):

```
per backfill page:
  1. messages.list(pageToken) → batchGet → upsert      (historical bulk, newest→oldest)
  2. applyHistorySince(watermark) → newWatermark        (catches in-flight adds/labels/deletes)
  3. persist historyId = newWatermark                   (watermark advances every page)
  4. nextPageToken ? re-enqueue : flip status→delta
```

Because the watermark advances each page, it stays within **one page-interval**
(seconds) of fresh and **cannot expire mid-backfill** — removing the root cause.

### Why this is correct (nothing missed)

- Historical messages (existed at page-1 time) → captured by `messages.list`.
- In-flight new messages / label changes / deletes (after page-1 time) →
  captured by `applyHistorySince` and the watermark advances past them.
- Both paths use the same idempotent `upsertMessage` / `deleteMessage`, so a
  message fetched by both in one cycle is harmless.
- When `messages.list` is exhausted and history is caught up, the watermark is
  already fresh → flip to steady-state delta with no gap.

### Shared helper

`applyHistorySince(token, accountId, startHistoryId)` extracts the history
pagination + record application from `delta.ts` so both `delta.ts` and
`backfill.ts` reuse it. It throws `GmailHistoryExpiredError` on a `404` so each
caller keeps its own recovery policy:

- **delta**: existing resync / `resyncCount` escalation.
- **backfill**: a `404` here is extremely narrow (the job stalled longer than
  Gmail's history window *between two pages*, e.g. a crash + long-delayed retry).
  Re-arm from a fresh `profile.historyId` and continue the backfill (bounded
  recovery, logged; the stall's in-flight changes reconcile on the next full
  resync).

### resyncCount escalation

Kept as a safety net. With self-renewing backfill the steady-state 404 loop
should essentially never trigger, but the escalation remains cheap insurance for
genuinely pathological cases (e.g. account offline longer than the history
window).

## Files touched

- `server/internal/history-sync.ts` (new) — `applyHistorySince` shared helper.
- `server/internal/delta.ts` — use the helper; recovery logic unchanged.
- `server/internal/backfill.ts` — renew watermark per page via the helper.
- `server/internal/bootstrap.ts` — update the now-stale capture-before comment.
- `CLAUDE.md` — document the self-renewing watermark.
