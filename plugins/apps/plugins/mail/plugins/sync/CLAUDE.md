# sync

The Gmail **sync engine** — the only genuinely new code in the Gmail-client
vision (everything else composes existing primitives). It fills the otherwise
empty `mail-core` tables by mirroring a Gmail mailbox into Postgres: backfill,
incremental delta, and a bounded full-resync fallback.

Depends on `gmail-api` (the stateless token-in/JSON-out REST client) and
`mail-core` (the persisted tables + `requireGmailToken()`). MIME parsing is a
pure, sync-internal concern (`server/internal/mime.ts`, with a co-located
`bun:test`), not a reuse boundary.

## Sync state machine (`mail_sync_state.status`)

```
idle → (bootstrap) → backfilling → (last page) → delta ⇄ (404 expiry) → backfilling
```

- **`historyId`** is the watermark — the Gmail mailbox revision the local mirror
  is current to. `getProfile().historyId` is captured at bootstrap as the
  *initial* watermark; the backfill then **renews it on every page** by consuming
  `history.list` from the current watermark forward (`applyHistorySince` in
  `history-sync.ts`). This keeps the watermark within one page-interval of fresh,
  so a long backfill can never outlive Gmail's history-retention window — the
  root cause of the stale-historyId resync loop. It also captures in-flight
  additions/label-changes/deletions that `messages.list` (newest-first, paging
  downward) would otherwise skip, so nothing is lost. (Capturing a *fresh*
  `profile.historyId` at completion instead would be **unsafe**: `messages.list`
  is not a point-in-time snapshot, so it misses messages that arrive during
  backfill, and a post-backfill watermark would start the first delta past them.)
- **`lastFullSyncAt` / `lastDeltaSyncAt`** are observability timestamps.
- The backfill **cursor** (Gmail `pageToken`) lives in the **job input**, not the
  DB — durable in the graphile row, so crash recovery resumes the exact page with
  no schema column.

## The three jobs + the manual endpoint

- **`mail.backfill`** (`backfill.ts`) — one `messages.list` page per run:
  batched `messages.get` → `upsertMessage`; then **renews the watermark** for the
  page (`applyHistorySince` from the current `historyId`, persisting the advanced
  value); re-enqueues itself for the next page; on the final page flips `status`
  to `delta`. Dedup keyed by `accountId` (one chain per account). A permanent
  permission/contract failure (`GmailApiError` 400/401/403) throws
  `NonRetryableError` so it dead-letters after one attempt instead of burning the
  retry budget; transient errors retry the page (upserts are idempotent). A
  stale-watermark 404 during renewal is extremely narrow (the job stalled longer
  than Gmail's history window *between two pages*); it re-arms from a fresh
  `profile.historyId` and continues (logged to `mail-sync`).
- **`mail.delta`** (`delta.ts`) — paginates `history.list` from the watermark,
  collects records, advances `historyId`. On a stale-watermark 404
  (`GmailHistoryExpiredError`) it re-enters `backfilling` from a fresh profile
  `historyId` and enqueues a backfill (bounded full resync). **Label changes are
  applied by re-fetching the affected messages and re-upserting** (the upsert
  reconciles labels + flags + thread) rather than hand-patching deltas — simpler
  and idempotent. Dedup keyed by `accountId`. Consecutive 404-expiry resyncs are
  counted on `mail_sync_state.resyncCount`; after `MAX_CONSECUTIVE_RESYNCS` (3)
  consecutive expiries with no successful delta in between (a mailbox too large to
  back up before Gmail's history window expires), the engine escalates to a
  terminal `resync_loop` error instead of looping forever. The counter resets to
  0 on any successful delta pass and on a manual retry (`kickSync`).
- **`mail.sync-tick`** (`tick.ts`) — the steady-state driver. Auto-connects once
  the Gmail toggle is on (`ensureAccount()` when no account exists), then
  enqueues a delta for every account in a `delta`/`idle` state. `singleton`
  dedup, `cron: "* * * * *"`, **main-only** (see below). A first-connect
  bootstrap failure is recorded onto the account's `mail_sync_state` row by
  `ensureAccount` (→ surfaced live on the sync-status banner) and **swallowed**
  here — consistent with the per-account "record and move on" handling — so a
  terminal connection error (api_disabled/auth) does not dead-letter the tick
  every minute; it's logged to the `mail-sync` channel for observability.

  Bootstrap (`bootstrap.ts`) creates the `mail_accounts` row from the connected
  Google email (from the OAuth identity, via `requireGmailToken()`, *without* a
  Gmail API call) **before** the first `getProfile`/`listLabels` call, so a
  bootstrap-time API failure has a real row to attach its classified error to. An
  unarmed error-placeholder row (`historyId` still null) is re-armed with a fresh
  watermark on the next successful connect, so enabling the API + "Retry now"
  recovers cleanly.
- **`POST /api/mail/sync`** (`handlers.ts`) — manual "connect / sync now": arms
  the account and, when already in `delta`, kicks an immediate delta. The trigger
  used by the phase-3 UI and for worktree testing (the tick is main-only and
  won't fire in a worktree). When Gmail isn't connected, `requireGmailToken()`
  throws and the failure surfaces loudly.

## No-polling exception

Singularity bans `setInterval`/`setTimeout` polling. Gmail's steady-state delta
is the **sanctioned exception**: Gmail push notifications (`users.watch` →
Pub/Sub) require a public inbound HTTPS endpoint + topic that a per-worktree
backend behind the gateway cannot expose. `history.list` is pull-only — there is
no change signal to subscribe to. So the delta runs as a **scheduled
`defineJob`** (`mail.sync-tick`), not an in-process timer. The schedule is
**main-only** (`perWorktree` left unset): sync hits shared external Gmail state
and the canonical mailbox lives in main's DB, so running it per-worktree would
duplicate work and race. The manual endpoint still enqueues on the current
runtime, so the engine is fully testable inside a worktree.

## Quota ("batched")

Google's JSON multipart batch endpoint is deprecated. `batchGetMessages`
(`gmail-api`) is therefore a **concurrency-bounded parallel fan-out** (8 in
flight) with exponential backoff on 429/5xx in the shared request helper — the
current recommended pattern, respecting the per-user quota.

## Limitations (documented, deferred)

- **Bounded resync ≠ deletion reconciliation.** The 404-expiry full resync
  re-fetches and upserts everything but does **not** detect messages deleted on
  the server during the gap (Gmail gives no deleted-set without history). A
  periodic full reconcile is a later-phase follow-up.
- **Attachment blobs are not downloaded** in this phase — only metadata +
  `gmailAttachmentId` are stored (`storedAttachmentId` stays null). Lazy blob
  fetch lands with the reading pane in a later phase.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Gmail sync engine: paginated backfill, history.list incremental delta with a bounded full-resync fallback on historyId expiry, and a scheduled main-only delta tick (the documented no-polling exception). Parses MIME into envelopes/bodies/attachment-metadata and mirrors threads/messages/labels into the mail-core tables.
- Server:
  - Uses: `apps/mail/gmail-api.batchGetMessages`, `apps/mail/gmail-api.getProfile`, `apps/mail/gmail-api.listHistory`, `apps/mail/gmail-api.listLabels`, `apps/mail/gmail-api.listMessages`, `apps/mail/mail-core._mailAccounts`, `apps/mail/mail-core._mailAttachments`, `apps/mail/mail-core._mailLabels`, `apps/mail/mail-core._mailMessageLabels`, `apps/mail/mail-core._mailMessages`, `apps/mail/mail-core._mailSyncState`, `apps/mail/mail-core._mailThreads`, `apps/mail/mail-core.requireGmailToken`, `database.db`, `infra/endpoints.implement`, `infra/jobs.defineJob`, `infra/jobs.NonRetryableError`, `integrations/gmail.isGmailEnabled`, `primitives/log-channels.Log`
  - Exports: Values: `mailSyncStateServerResource`
  - Register: `defineJob('mail.backfill')`, `defineJob('mail.delta')`, `defineJob('mail.sync-tick')`
  - Routes: `POST /api/mail/sync`
- Core:
  - Uses: `infra/endpoints.defineEndpoint`
  - Exports: Values: `mailSyncEndpoint`

<!-- AUTOGENERATED:END -->
