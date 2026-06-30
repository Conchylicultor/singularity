# Plan: Gmail mail client — sync engine (phase 2)

**Status:** Design, ready to implement.
**Date:** 2026-06-30
**Vision:** `research/2026-06-29-apps-gmail-client.md` (phase 2 of the roadmap).
**Prereq landed:** phase 1 — `plugins/apps/plugins/mail/plugins/mail-core/` (the 9-table
`defineEntity` data model + `requireGmailToken()`), and `integrations/gmail/`
(OAuth scope + enabled toggle + `getGmailToken()`).

---

## Context

The mail data model exists but the mailbox is empty — nothing fills
`mail_threads` / `mail_messages` / `mail_labels` / `mail_attachments`. This phase
builds the **sync engine**: the only genuinely new code in the Gmail-client
vision (everything else is composition of existing primitives).

It must:

1. **Backfill** — paginate `messages.list` → batched `messages.get`, parse MIME
   (multipart, text+html, inline `cid:` images, attachments), store
   envelopes + bodies + attachment metadata.
2. **Incremental delta** — `history.list` from a stored `historyId` watermark;
   apply added/deleted/label-changed messages; advance the watermark.
3. **History-expiry fallback** — when Gmail rejects a stale `historyId` (404),
   fall back to a bounded full resync.
4. **Respect quota** — concurrency-bounded batched gets + exponential backoff on
   429/5xx.
5. **No webhook** — Gmail push (`users.watch` → Pub/Sub) needs a public inbound
   URL a worktree backend lacks, so the delta runs as a **scheduled `defineJob`**
   — the documented exception to the no-polling rule.

There is no UI in this phase (the inbox list is phase 3). The engine is driven by
a scheduled tick (steady state) plus one manual `POST` endpoint (first-connect /
"sync now" / worktree testing). Writes to ordinary Postgres tables propagate to
future live-state resources automatically via `database/change-feed` — no manual
`notify` needed here.

---

## Plugin structure

Two new sub-plugins under `plugins/apps/plugins/mail/plugins/`, siblings of the
existing `mail-core` and `shell`:

```
mail/plugins/
  gmail-api/     NEW — stateless, typed Gmail REST v1 client (reused by compose/send later)
    core/index.ts          — types (GmailProfile, GmailMessage, GmailHistory, GmailLabel) + error classes
    server/index.ts        — client fns taking a `token` param; batching + backoff
    server/internal/{request,messages,history,labels,profile}.ts
  sync/          NEW — the sync engine (jobs + storage + MIME parse + endpoint)
    core/endpoints.ts      — defineEndpoint contract (POST /api/mail/sync)
    server/index.ts        — barrel: register jobs + httpRoutes
    server/internal/
      bootstrap.ts         — ensureAccount(): getProfile → upsert account, labels, sync_state
      backfill.ts          — mail.backfill job (one page/run, self-re-enqueues)
      delta.ts             — mail.delta job (history.list apply + 404 resync fallback)
      tick.ts              — mail.sync-tick scheduled job (main-only) — steady-state driver
      store.ts             — upsert helpers (label / message / thread rollup / attachment / message_labels / delete)
      mime.ts              — pure Gmail-payload MIME parser + address/header helpers
      mime.test.ts         — bun:test for the pure parser
      handlers.ts          — endpoint handler
    CLAUDE.md              — documents the no-polling exception + sync state machine
```

**Why split this way.** `gmail-api` is a stateless REST client reused beyond
sync (compose/send in phase 5, lazy attachment fetch in phase 3), so it's its own
plugin and takes `token` as a parameter (never imports `mail-core` → no cycle).
`sync` owns the stateful orchestration and depends on `gmail-api` + `mail-core`.
MIME parsing is a pure, sync-internal concern (not a reuse boundary) so it stays
`server/internal/mime.ts` with a co-located `bun:test`, not its own plugin.
Dependency graph stays a DAG: `sync → {gmail-api, mail-core}`; `gmail-api → {}`.

All cross-plugin imports go through barrels:
`@plugins/apps/plugins/mail/plugins/gmail-api/{core,server}`,
`@plugins/apps/plugins/mail/plugins/mail-core/server`.

---

## `gmail-api` — typed Gmail REST client

Base: `https://gmail.googleapis.com/gmail/v1/users/me`. One shared
`gmailRequest(token, path, init?)`:

- Sets `Authorization: Bearer <token>`, parses JSON.
- **Backoff**: wraps the fetch in `retryUntil` (`@plugins/packages/plugins/retry/core`)
  with `withJitter(exponential({ initial: 500, max: 30_000 }))`, bounded by a
  deadline. Retries on `429`, `403 rateLimitExceeded`/`userRateLimitExceeded`,
  and `5xx`; returns the parsed body otherwise.
- **Typed errors** (in `gmail-api/core`): `GmailHistoryExpiredError` thrown on
  `404` from the history endpoint (stale `historyId`); `GmailApiError` for other
  non-retryable `4xx` (carries status + Gmail error reason).
- Plain `fetch` is correct here (fixed, trusted Google host); `safe-fetch` is for
  attacker-influenced URLs and is intentionally NOT used.

Exported functions (all take `token` first):

- `getProfile(token): GmailProfile` — `{ emailAddress, historyId, messagesTotal, threadsTotal }`.
- `listMessages(token, { pageToken?, q?, labelIds?, maxResults? }): { messages: {id,threadId}[], nextPageToken?, resultSizeEstimate }`.
- `getMessage(token, id, format='full'): GmailMessage` — raw `payload` tree + `labelIds` + `internalDate` + `snippet` + `sizeEstimate` + `historyId`.
- `batchGetMessages(token, ids[]): GmailMessage[]` — runs `getMessage` through a
  `createSemaphore(BATCH_CONCURRENCY=8)` (`@plugins/packages/plugins/semaphore/core`)
  so at most 8 requests are in flight; preserves input order; a per-message
  failure rethrows (job retries the whole page — idempotent via upserts).
- `listHistory(token, { startHistoryId, pageToken?, historyTypes? }): { history: GmailHistory[], nextPageToken?, historyId }` — throws `GmailHistoryExpiredError` on 404.
- `listLabels(token): GmailLabel[]`.

> "Batched" = concurrency-bounded parallel `messages.get` with backoff. Google's
> classic JSON-batch endpoint is deprecated; bounded-parallel + backoff is the
> current recommended pattern and respects the per-user quota.

---

## `sync` — the engine

### Sync state machine (`mail_sync_state.status`)

`idle` → (bootstrap) → `backfilling` → (last page) → `delta` ⇄ (404 expiry) →
`backfilling`. `error` on a hard failure. The `historyId` column is the
watermark; `lastFullSyncAt` / `lastDeltaSyncAt` are observability timestamps. The
backfill cursor (Gmail `pageToken`) is carried in the **job input**, not the DB —
durable in the graphile row, so no schema change is needed.

### `ensureAccount()` (`bootstrap.ts`) — idempotent

1. `requireGmailToken()` (mail-core barrel).
2. `getProfile(token)`.
3. Upsert `mail_accounts` by **email** (find-or-create; id = `randomUUID()` on
   first create, `connectedAt` stamped). Gmail message/thread/label ids are
   globally unique per mailbox and stored as-is (the row PKs); `accountId`
   disambiguates for future multi-account.
4. `listLabels` → `store.upsertLabels(accountId, labels)`.
5. Upsert `mail_sync_state`: if new, `historyId = profile.historyId`,
   `status = "backfilling"`, and `backfillJob.enqueue({ accountId })`. If the row
   already exists, leave it (don't restart a backfill). Returns `{ accountId, status }`.

Capturing `profile.historyId` **before** backfill means any change during the
(possibly long) backfill is caught by the first delta from that watermark.

### `mail.backfill` job (`backfill.ts`)

`input: { accountId, pageToken? }`, `dedup: { key: ({accountId}) => accountId }`
(one backfill chain per account), `event: z.never()`.

Each run = **one page**:
1. Guard: load sync_state; if `status !== "backfilling"`, return (cancelled).
2. `requireGmailToken()` fresh (NOT inside `ctx.step` — tokens expire; central owns refresh).
3. `listMessages(token, { pageToken, maxResults: 100 })`.
4. `batchGetMessages(token, ids)` → for each, `store.upsertMessage(accountId, msg)`.
5. If `nextPageToken`: `backfillJob.enqueue({ accountId, pageToken: next })` and return.
6. Else (done): set `status="delta"`, `lastFullSyncAt = now`; advance `historyId`
   to the max message `historyId` seen if greater (keeps the watermark fresh).

Bounded work per run + durable cursor + idempotent upserts = clean crash
recovery. `maxAttempts` modest; a transient API failure retries the page,
permanent contract failure throws `NonRetryableError`.

### `mail.delta` job (`delta.ts`)

`input: { accountId }`, `dedup` keyed by accountId, `event: z.never()`.

1. Load sync_state; skip if `status === "backfilling"` or `historyId` null.
2. `requireGmailToken()`.
3. Paginate `listHistory(token, { startHistoryId: historyId })` collecting all
   records. On `GmailHistoryExpiredError`: set `status="backfilling"`, fetch fresh
   `getProfile`, set `historyId = profile.historyId`, `backfillJob.enqueue` (bounded
   full resync), return.
4. Apply records in order via `store`:
   - `messagesAdded` → `batchGetMessages` the new ids → `upsertMessage`.
   - `messagesDeleted` → `store.deleteMessage(id)`.
   - `labelsAdded` / `labelsRemoved` → reconcile `mail_message_labels` and the
     derived message flags, then `recomputeThread`.
5. Advance `historyId` to the response's latest `historyId`,
   `lastDeltaSyncAt = now`, keep `status="delta"`.

### `mail.sync-tick` scheduled job (`tick.ts`) — the no-polling exception

`schedule: { cron: "* * * * *" }` (every minute, **main-only** — `perWorktree`
left unset, since sync hits shared external state and the canonical mailbox lives
in main's DB). `dedup: "singleton"`, `input: z.object({})`.

Each tick: if `isGmailEnabled()` and no account exists → `ensureAccount()`
(auto-connect on toggle). Then for every account whose `status` is `delta`/`idle`,
`deltaJob.enqueue({ accountId })`. Backfilling accounts self-continue via their
own re-enqueue chain and are skipped here.

> **No-polling exception (documented in the plugin CLAUDE.md):** Gmail push
> notifications require an inbound public HTTPS endpoint + Pub/Sub topic, which a
> per-worktree backend behind the gateway cannot expose. `history.list` is the
> only available delta signal and it must be pulled. This is the sanctioned
> escape hatch — a scheduled `defineJob`, not an in-process `setInterval`.

### `store.ts` — storage layer

- `upsertLabels(accountId, gmailLabels)` — map Gmail label → `mail_labels`
  (system/user from `label.type`, `color`/`textColor` from `label.color`),
  `onConflictDoUpdate`.
- `upsertMessage(accountId, gmailMessage)`:
  1. Parse via `mime.parseGmailMessage`.
  2. Ensure `mail_threads` stub row exists (`insert … onConflictDoNothing`) — FK
     parent before the message insert.
  3. `insert mail_messages … onConflictDoUpdate` (envelope, bodies, flags derived
     from `labelIds`: `unread`=has `UNREAD`, `starred`=`STARRED`, `isSent`=`SENT`,
     `isDraft`=`DRAFT`).
  4. Reconcile `mail_message_labels` to `msg.labelIds` (delete-missing + insert-new).
  5. Upsert `mail_attachments` metadata rows (`gmailAttachmentId`, filename, mime,
     size, `inline`, `contentId`; `storedAttachmentId=null` — blob download is lazy,
     a later phase).
  6. `recomputeThread(accountId, threadId)`.
- `recomputeThread(accountId, threadId)` — aggregate from the thread's messages:
  `subject` (first), `snippet` (last), `participants` (union from/to), `lastMessageAt`
  (max internalDate), `messageCount`, `unread`/`starred`/`important`/`hasAttachments`
  (any), `labelIds` (union). Update the thread row. If the thread has no messages
  left, delete it.
- `deleteMessage(messageId)` — delete the message (cascades labels/attachments),
  then `recomputeThread`.

### `mime.ts` — pure parser (`bun:test` covered)

- `parseGmailMessage(gmailMessage): { from, to, cc, bcc, replyTo, subject, snippet, headers, bodyText, bodyHtml, internalDate, attachments }`.
- `walkPayload(payload)` — recursive: `text/plain` → bodyText, `text/html` →
  bodyHtml (last wins for multipart/alternative); parts with `filename` or
  `body.attachmentId` → attachments (`inline` when `Content-Disposition: inline`
  or a `Content-ID` is present).
- `parseAddressList(value): MailAddress[]`, `parseAddress(s)` — RFC-5322-ish
  `Name <email>` / bare `email`.
- `headerMap(headers[]): Record<string,string>` (lowercased keys),
  `decodeBase64Url(data): string`.

Tests cover: text-only, multipart/alternative, nested multipart/mixed with
attachment + inline cid image, address-list parsing, base64url decode.

### Endpoint (`core/endpoints.ts` + `handlers.ts`)

One endpoint, wired via `httpRoutes` in the server barrel:

- `POST /api/mail/sync` → `ensureAccount()`; if `status === "delta"` also
  `deltaJob.enqueue`. Returns `{ accountId, status }` (or a `409`-style body when
  Gmail isn't enabled/connected — `requireGmailToken` throws, surfaced as the
  error). This is the manual "connect / sync now" trigger used by the phase-3 UI
  and for worktree testing (the scheduled tick is main-only and won't fire in a
  worktree).

`defineEndpoint` from `@plugins/infra/plugins/endpoints/core`; `implement` +
`HttpError` from `@plugins/infra/plugins/endpoints/server`.

---

## Files to create / modify

**Create** (all under `plugins/apps/plugins/mail/plugins/`):
- `gmail-api/` — `package.json`, `core/index.ts`, `core/internal/{types,errors}.ts`,
  `server/index.ts`, `server/internal/{request,profile,messages,history,labels}.ts`, `CLAUDE.md`.
- `sync/` — `package.json`, `core/endpoints.ts`, `server/index.ts`,
  `server/internal/{bootstrap,backfill,delta,tick,store,mime,handlers}.ts`,
  `server/internal/mime.test.ts`, `CLAUDE.md`.

**Modify:**
- `plugins/apps/plugins/mail/CLAUDE.md` — add the two sub-plugins + phase-2 note.
- (Registry roots `server.generated.ts` etc. are regenerated by `./singularity build` — never hand-edited.)

**Reuse (no change):** `mail-core/server` (`_mail*` tables, `requireGmailToken`),
`integrations/gmail/server` (`isGmailEnabled`), `infra/jobs` (`defineJob`,
`NonRetryableError`), `packages/{retry,semaphore}`, `infra/endpoints`,
`infra/entities` (already done), `database/change-feed` (auto live-state).

---

## Verification

1. `./singularity build` — regenerates migrations (none expected — no schema
   change), registry roots, type-checks, restarts. Must be green.
2. `bun test plugins/apps/plugins/mail/plugins/sync/server/internal/mime.test.ts`
   — the pure MIME parser (no DB / network).
3. `./singularity check` — boundaries, registry-in-sync, plugins-doc-in-sync,
   type-check.
4. **End-to-end (needs a connected Google account with Gmail enabled in
   Settings):** `curl -XPOST http://<wt>.localhost:9000/api/mail/sync` →
   inspect with the `query_db` MCP tool:
   `SELECT status, history_id FROM mail_sync_state;`,
   `SELECT count(*) FROM mail_messages;`,
   `SELECT count(*) FROM mail_threads;`. Backfill should advance and
   `status` settle to `delta`. Without a connected account, the endpoint/job fail
   **loudly** (`requireGmailToken` throws) — the expected, visible behavior;
   `status` lands `error` and the failure surfaces in the jobs/queue debug pane.

---

## Risks / decisions

- **Source-of-truth runtime.** Steady-state sync is main-only (scheduled tick),
  matching the rest of the app (main = canonical, worktrees = forks). The manual
  endpoint enqueues on the current runtime, so the engine is fully testable inside
  a worktree.
- **Bounded resync ≠ deletion reconciliation.** The 404-expiry full resync
  re-fetches and upserts everything but does not detect messages deleted on the
  server during the gap (Gmail gives no deleted-set without history). Documented;
  a periodic full reconcile is a later-phase follow-up.
- **Attachment blobs are not downloaded** in this phase (metadata + `gmailAttachmentId`
  only; lazy fetch lands with the reading pane in phase 3).
- **Initial backfill fetches the whole mailbox**, newest-first, one page/run. A
  `MAX_BACKFILL_MESSAGES` cap can be added via config later if needed; called out,
  not built now.
</content>
</invoke>
