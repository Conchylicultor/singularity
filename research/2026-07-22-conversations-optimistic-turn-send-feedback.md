# Optimistic turn-send feedback: instant echo, transcript-verified confirmation

## Context

Sending a prompt from the conversation view currently gives no trustworthy feedback:

- The "Sending…" echo (`PendingTurnEcho`) is triggered by `markTurnSent` only **after** `POST /turn` resolves (`prompt-input.tsx:35-53`). Under host load the server's tmux paste round-trip takes seconds, so the echo appears seconds after Enter — defeating its purpose.
- The echo is cleared by a coarse heuristic — "any new transcript event arrived" (`jsonl-pane.tsx:230-247`), not by matching the sent text. A POST that returns 200 but whose text never reaches the transcript (the tmux paste race, `research` on 2026-07-22 incident) is cleared by the first unrelated event: **the message silently vanishes and looks sent**.
- The pending store is an in-memory `Map` — lost on refresh; a failed POST is toast-only, with no failed state and no retry.

Goal: on Enter the prompt appears **immediately** (pre-POST) as "sending…", then resolves to an **explicit sent/failed/unconfirmed** status where "sent" means *the text was found in the Claude session JSONL* (ground truth), surviving page refreshes and server restarts.

Scope decisions (fixed):
- **Client-side durable** pending record (localStorage). No server-side turn outbox; turn delivery stays synchronous.
- **Manual retry only.** No auto re-send — the paste race can strand text in the CLI input box where a later Enter would submit it, so double-delivery must be a deliberate user action. (Network-class auto-retry on the reconnect edge is a possible future extension, not built now.)
- The tmux-runtime paste race itself is **not** fixed here — but its symptom must become loud (`unconfirmed` state + report) instead of silent.

## Ownership

The `pending-turn` sub-plugin (`plugins/conversations/plugins/conversation-view/plugins/pending-turn/`) becomes the owner of the **entire send lifecycle** — record creation, the POST, timers, reconciliation, reporting. `prompt-input` shrinks to draft management + `sendPendingTurn()`.

**Bespoke store, not `useOptimisticResource`.** The generic hook is shaped for a mutable entity resource with per-op acks; `jsonl-events` is a whole-array disk-derived push with no per-op identity, and confirmation is a normalized-text match. We borrow its vocabulary (never-revert, `http` vs `network` failure classes, `failed` + manual `retry`, `useReportSync` integration) in a small purpose-built store.

## State machine

One record per send; a FIFO list per conversation (`MAX_RECORDS_PER_CONV = 10`) since the user can queue several sends while the agent works.

| State | Entered when | Renders | Timers |
|---|---|---|---|
| `sending` | Enter pressed (synchronous, **pre-POST**) | Dimmed card: text + "Sending…" + `BouncingDots` | POST with 30s `AbortSignal.timeout` |
| `posted` | POST 2xx | Same card, caption "Sent to CLI — confirming…" | one-shot 90s confirmation deadline (`deadlineAt`) |
| `queued` | a `queue-operation` **enqueue** event text-matches (busy path) | echo removed — the native queue-op row is the display | deadline still armed |
| `sent` | a new `user-text` event text-matches | text-less "Sent ✓" line for 1.5s, then removed; the real `user-text` row shows the message | `SENT_FLASH_MS` → remove record |
| `failed-post` (`http` \| `network`) | POST threw `EndpointError` / fetch rejected or timed out | Destructive card: error + **Retry** + **Copy to draft** | none |
| `unconfirmed` | deadline elapsed in `posted`/`queued` with no match; or reload found an in-flight record past deadline | Warning card: "Not confirmed — the agent may not have received this message. Check the terminal." + Retry + Copy to draft | files ONE report on entry |

Transitions: `sending → posted | failed-post`; `posted → queued | sent | unconfirmed`; `queued → sent | unconfirmed`; `failed-post`/`unconfirmed` `→ sending` (manual Retry re-POSTs the same text); `sent →` removed after flash.

Rendering rule (**replace, never duplicate**): the card renders only for `sending | posted | failed-post | unconfirmed`. In `queued`/`sent` the ground-truth row (queue-op row / user-text row) has taken over. The `sent` flash carries no text, so it never doubles the message.

Constants: `POST_TIMEOUT_MS = 30_000`, `CONFIRM_DEADLINE_MS = 90_000`, `SENT_FLASH_MS = 1_500`, `RECORD_TTL_MS = 7d` (matches persistent-draft's default; a stale card from days ago is still shown — and reported — before being swept).

## Transcript matching (the crux)

Identity = **normalized text + per-record baseline index**, one-shot consumed. The wire `user-text` event has no uuid (stripped by `parse-jsonl.ts`; `protocol.ts:49-55`), and the client can't know a uuid at send time anyway — do **not** change the wire protocol.

The transcript text ≠ the posted draft: `handlePostTurn` rewrites attachment refs (`![](/api/attachments/<id>)` → `@<disk-path>`) and trims (`handle-post-turn.ts:18-20`); `pushTextWithImages` (`parse-jsonl.ts:88-143`) then strips image `@<path>` tokens. Therefore:

- **The POST returns the server's `finalText`** (small schema change, below); matching uses that.
- `normalizeForMatch(s)`: strip image `@<path>` tokens (mirror `parse-jsonl.ts:96`), trim, collapse whitespace runs.

`matchPendingTurns(records, events)` (pure, in `reconcile.ts`, `bun:test`-covered):
- Stamp `baselineUserText` (count of `user-text` events) on first reconcile after creation — a pre-existing identical row can never match.
- Candidates: `user-text` events past the record's baseline; `queue-operation` enqueue events whose `content` normalizes equal. A `consumed` index set ensures two identical in-flight messages bind to **distinct** events (oldest-record-first, earliest-event-first). `user-text` match → `sent` wins over queue-op match → `queued`.
- Preprompt `<special_instructions>` wrapping only affects the launch turn, never `postConversationTurn` — not a concern.

The reconcile pass runs from `jsonl-pane` on every `events` change (it owns the events array), replacing the deleted baseline-count effect. Deadlines are one-shot `setTimeout`s (bounded, not polling).

## Durability & multi-tab

Bespoke localStorage-backed external store (module-level + `useSyncExternalStore`), persistence idiom copied from `persistent-draft` (`use-draft.ts:10-46`: `{v,ts}` envelope, custom sync event + native `storage` event) into `internal/persist.ts`. Key `singularity:pending-turns:<conversationId>`.

```ts
interface PendingTurnRecord {
  id: string;                  // uuid, stable across tabs
  ownerTabId: string;          // tab that drives POST/timers/report (primitives/tab-id)
  text: string;                // original draft (Retry / Copy-to-draft)
  resolvedText: string | null; // server finalText once POSTed
  state: "sending" | "posted" | "queued" | "sent" | "failed-post" | "unconfirmed";
  failureKind?: "http" | "network";
  errorMessage?: string;
  baselineUserText: number | null;
  createdAt: number;
  postedAt?: number;
  deadlineAt?: number;
  matchedAt?: number;
  reported?: boolean;          // unconfirmed report latched once
}
```

- All tabs render the shared records; only `ownerTabId === getTabId()` drives the POST promise, the deadline timer, and the report emit. `deadlineAt` is absolute, so any surviving tab can adopt an orphaned record on mount.
- **Reload/server-restart recovery**: the `jsonl-events` loader re-derives the full array from disk on every resubscribe (`jsonl-events-resource.ts`), so on mount: reconcile **before** any TTL sweep — `posted`/`queued` against disk truth (matched → `sent`; past deadline unmatched → `unconfirmed`; within deadline → re-arm remaining time). A `sending` record found at reload (POST outcome unknown): reconcile first; unmatched → `unconfirmed` with "Send interrupted — status unknown" + Retry. Never auto-resend.
- **TTL sweep never silently drops an unresolved record**: only terminal records (`sent`, and `failed-post`/`unconfirmed` that have already reported/surfaced) are dropped on expiry. A non-terminal record that expires without ever reconciling (tab closed before the deadline, reopened days later, transcript no longer resolvable) transitions through `unconfirmed` — filing its one deduped report — before removal. Every send therefore ends in exactly one of: a matched `sent`, a visible failed/unconfirmed card, or a report. No silent path exists.

## POST leg

`prompt-input.send` becomes: guard → `clearDraft()` **synchronously** (a second Enter is a no-op; the `sending`-disables-editor state is removed — the editor stays typable) → `sendPendingTurn(conversation.id, text)`.

Store internals: `fetchEndpoint(postConversationTurn, {id}, { body:{text}, signal: AbortSignal.timeout(POST_TIMEOUT_MS) })`; 2xx → `posted` (+`resolvedText`, deadline armed); `EndpointError` → `failed-post:http`; reject/abort → `failed-post:network`.

**Draft is never auto-restored on failure**: the text lives on the Failed card with **Retry** (re-POST as-is) and **Copy to draft** (write the shared `useDraft` key `conversation:prompt`, scope = conversationId, so the card needs no prop from the input). Restoring silently would duplicate the text in two places and invite an accidental double-send.

## Rendering (jsonl-viewer)

- Delete `pendingBaselineRef` + clearing effects (`jsonl-pane.tsx:230-247`) and the `!isWorking` suppression (`:181`) — feedback must show **while working**, exactly when messages queue.
- `usePendingTurns(conversation.id)` + reconcile effect; render `PendingTurnCard` per record in both branches (empty transcript `:263`, populated `:276`).
- `PendingTurnCard` (rewrite of `pending-turn-echo.tsx`): switch over `state` — existing UserTextRow-mirroring chrome for `sending`/`posted`, destructive chrome + buttons for `failed-post`, warning chrome for `unconfirmed`, text-less "Sent ✓" flash.
- Also report into the per-surface sync cloud via `useReportSync` (`error` when any failed/unconfirmed, `syncing` while sending/posted, `retry` wired) — platform-consistent ambient indicator for free.
- Conversation `gone`/`done` no longer force-clears pending records — reconciliation still decides (matched → sent, deadline → unconfirmed).

## Server touch points (small)

- `plugins/conversations/core/endpoints.ts` — `postConversationTurn` response: `z.object({ resolvedText: z.string() })` (currently void).
- `plugins/conversations/server/internal/handle-post-turn.ts` — `return { resolvedText: finalText }`. Turn delivery untouched.

## Failure surfacing (reports)

The dangerous silent case is `unconfirmed` (POST 200, never in transcript — the paste-race symptom). On entry, the owner tab files exactly one report (latched via `reported`):

- Add `"client-turn-unconfirmed"` to `CLIENT_REPORT_SOURCES` (`plugins/reports/core/sources.ts`).
- New report-kind sub-plugin `plugins/reports/plugins/turn-unconfirmed/` modeled on `reports/plugins/optimistic-divergence/`: `ReportKindSpec` with data `{ conversationId, textPreview, elapsedMs }`, fingerprint by `conversationId`, plus a `Reports.KindView` line.

`failed-post` states already surface via the card + `endpointErrorSink`; no extra report.

## Files

Create:
- `.../pending-turn/web/internal/persist.ts` — localStorage envelope + cross-tab sync
- `.../pending-turn/web/internal/reconcile.ts` — `normalizeForMatch` + `matchPendingTurns` (+ `reconcile.test.ts`, bun:test)
- `.../pending-turn/web/components/pending-turn-card.tsx`
- `plugins/reports/plugins/turn-unconfirmed/` (server kind spec + web KindView)

Modify:
- `.../pending-turn/web/internal/store.ts` — rewrite: durable state machine, POST lifecycle, timers, report emit
- `.../pending-turn/web/index.ts` — exports: `sendPendingTurn`, `retryPendingTurn`, `dismissPendingTurn`, `reconcilePendingTurns`, `usePendingTurns`, `PendingTurnCard`, `PendingTurnRecord`
- `.../prompt-input/web/components/prompt-input.tsx` — synchronous clearDraft + `sendPendingTurn`; drop local POST/try-catch/`sending` disable
- `.../jsonl-viewer/web/components/jsonl-pane.tsx` — remove baseline effects + working-suppression; add reconcile + card list
- `plugins/conversations/core/endpoints.ts`, `plugins/conversations/server/internal/handle-post-turn.ts` — `{ resolvedText }`
- `plugins/reports/core/sources.ts` — new client source
- CLAUDE.md updates: `pending-turn`, `prompt-input`

Old API (`markTurnSent`/`clearPendingTurn`/`usePendingTurn`/`PendingTurnEcho`) has exactly two callers (`prompt-input.tsx`, `jsonl-pane.tsx`) — removed with no external breakage.

## Edge cases

- Two identical messages in flight → distinct event consumption via the `consumed` set (deterministic assignment).
- Send while working → card shows; `queue-operation` enqueue upgrades to `queued` (card yields to the native row); delivery `user-text` → `sent`.
- Attachment/image messages → both sides normalized (server rewrite handled by matching on `resolvedText`; image tokens stripped).
- POST 200 + text never lands (paste race) → 90s → `unconfirmed` + one deduped report + Retry.
- Refresh or server restart mid-send → record survives in localStorage; reconciles against disk truth; always resolves explicitly, never lost.
- TTL expiry of a never-reconciled record → routed through `unconfirmed` (report filed) before removal — no silent drop.
- Multi-tab → both render; owner tab drives timers/report once.

## Verification

1. **Instant echo**: throttle to Slow 3G; Enter → `sending` card renders same-frame, before the POST resolves; then `posted` → `sent` flash → real row, no duplicate.
2. **Busy path**: send while agent works → card visible while working, upgrades to `queued` on the enqueue row (single display), then `sent`.
3. **HTTP failure**: block `POST /turn` in devtools → `failed-post:http` card, Retry re-POSTs, Copy-to-draft repopulates the editor.
4. **Network/timeout**: offline → `failed-post:network` after the 30s abort; reconnect + Retry.
5. **Unconfirmed**: lower `CONFIRM_DEADLINE_MS`, stub `sendTurn` to 200-without-paste → `unconfirmed` card + exactly one `turn-unconfirmed` report in Debug → Reports.
6. **Refresh mid-send** and **server restart mid-send**: record survives, reconciles against disk truth to `sent` or `unconfirmed` — never silently lost.
7. **Multi-tab**: two tabs, send in A → both render; only A drives the timer; one report.
8. **Unit**: `bun test .../pending-turn/web/internal/reconcile.test.ts` — normalization (attachment rewrite, image tokens, whitespace), baseline exclusion, identical-message distinct consumption, user-text-over-queue-op precedence.
