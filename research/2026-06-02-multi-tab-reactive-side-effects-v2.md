# Multi-Tab Reactive Side-Effects (v2)

> Supersedes [`2026-06-01-multi-tab-reactive-side-effects.md`](./2026-06-01-multi-tab-reactive-side-effects.md). v1 correctly diagnosed the bug and enumerated the blast radius, but framed the fix as four source-gating layers and recommended splitting `toast()` first. v2 reorders around the actual structural guarantee (an idempotent sink), fixes a sequencing regression, drops the `useServerReaction` escape hatch, and reframes the lint rule from "guarantee" to "tripwire."

## Context

Notifications are duplicated ~5–7× in the DB. The count matches the number of open browser tabs. Root cause is structural: any `useEffect` that reacts to shared server state (via `useResource`, `subscribeWsStatus`) and triggers I/O runs independently in every tab. There is no primitive that says "run this side-effect once globally," and no sink that collapses duplicate writes.

Confirmed at the sink: `recordNotification` (`plugins/notifications/server/internal/record-notification.ts:18`) mints `notif-${Date.now()}-${Math.random()}` per call. N callers → N rows, structurally. The sink has zero idempotency.

## The pattern

```
useResource(sharedState) → useEffect(deps) → I/O (fetch, toast, invalidate)
```

Every tab receives the same live-state push, runs the same effect, fires the same I/O. Writes duplicate N×; reads amplify N×. The safe pattern — user-initiated mutations via click handlers — is correct by construction: only one tab receives the click.

## The two axes

The fix is not one thing. There are two orthogonal properties, and a robust system needs both:

- **Axis A — how many times does the effect fire?** N (one per tab) vs 1 (server-side). Addressed by **moving reactions server-side** (§2).
- **Axis B — does firing twice cause harm?** Yes vs no. Addressed by an **idempotent sink** (§1).

> Axis A makes it fire once. Axis B makes a second fire harmless. The lint rule (§3) catches the cases that escape both.

Neither axis alone is sufficient:

- **Idempotency alone** leaves Axis A bad: permanent N× I/O/load, and protection that's opt-in per sink — the *next* reactive effect an agent writes points at some other sink (new endpoint, external API, agent launch) that isn't idempotent unless that agent remembered to make it so. That's exactly the "getting it wrong" we're designing out.
- **Server-side alone** leaves Axis B exposed: any reaction that genuinely must stay client-side, or any sink reached by a path that escapes review, corrupts on duplicate fire.

So the property we actually want — *new reactive code is safe by default* — comes from server-side reactions being the path of least resistance, with idempotency as the net and lint as the tripwire.

## Affected entry points

### Write mutations (duplicated across tabs)

**`toast()` — 6 sites, each POSTs `POST /api/notifications`.** `toast()` bundles two concerns: ephemeral UI toast (`ShellCommands.Toast`) + DB persistence (`fetchEndpoint(createNotification)`). The UI toast should fire per-tab; the DB write should fire once.

| # | File | Line | Trigger |
|---|---|---|---|
| 1 | `plugins/health/web/components/reconnect-watcher.tsx` | 14 | WS reconnect via `subscribeWsStatus` |
| 2 | `plugins/conversations/plugins/conversations-view/web/components/auto-launch-watcher.tsx` | 38 | New conversation in `conversationsResource` |
| 3 | `plugins/conversations/plugins/conversations-view/web/components/fork-error-watcher.tsx` | 25 | New fork error in `forkErrorsResource` |
| 4 | `plugins/build/web/components/build-button.tsx` | 59,61 | Build finishes (`buildHistoryResource`) |
| 5 | `plugins/build/web/components/build-button.tsx` | 88 | Auto-build starts (`buildHistoryResource`) |
| 6 | `plugins/conversations/plugins/summary/web/components/summary-pane.tsx` | 38 | Summary arrives in `conversationSummariesResource` |

**PushAndExitButton — 3 effects, each fires `DELETE /api/conversations/:id/push-and-exit`.**

| # | File | Line | Trigger |
|---|---|---|---|
| 7 | `.../push-and-exit/web/components/push-and-exit-button.tsx` | 89 | Conversation loses process while job active |
| 8 | same | 98 | Job status → `"clean"` via `pushAndExitResource` |
| 9 | same | 110 | Job status → `"error"` via `pushAndExitResource` |

### Visual-only duplication (N toasts, no DB write)

| # | File | Line | Trigger |
|---|---|---|---|
| 10 | `plugins/notifications/web/components/bell-button.tsx` | 107 | Server notification → `ShellCommands.Toast()` |

This one is **correct as-is** — a per-tab toast for a per-tab UI event. No fix needed.

### Read amplification (N×GET per push, no corruption)

| # | File | Line | Trigger |
|---|---|---|---|
| 11 | `plugins/conversations-recover/web/components/recovery-view.tsx` | 71 | `conversationsResource` push → `invalidateQueries` |
| 12 | `plugins/plugin-meta/plugins/plugin-health/web/components/health-section.tsx` | 58,68 | `pluginHealthReviewsDescriptor` push → GET staleness + tasks |
| 13 | `.../code/plugins/docs-button/web/use-pushed-doc-files.ts` | 33 | `pushesResource` push → GET per push ID |

These are **by design, not bugs.** Each tab has its own TanStack cache and legitimately needs fresh data to render. Idempotency collapses rows, not requests; server-side reactions don't help a tab that must display current state. Leave them; do not put them on the fix list. (Listed here only so a future reader doesn't "rediscover" them as new bugs.)

### Scope claim to verify

v1 asserts "every other mutation in the codebase is user-initiated." This is load-bearing for the bounded scope. **Action:** grep `fetch` / `fetchEndpoint` / `mutate` / `invalidateQueries` inside `useEffect` across the repo and confirm the 9 sites above are exhaustive before declaring the audit complete. Until then, treat the list as "known," not "all."

## Plan

### §1 — Idempotent sink (Layer 0): the unconditional backstop

Make the sink collapse duplicate writes, so duplication is harmless regardless of how many tabs fire or how the caller is written.

**Notifications.** Add a `dedupeKey` to `RecordNotificationInput` and a unique constraint on it; insert with `ON CONFLICT (dedupe_key) DO NOTHING`.

- Key is **caller-supplied and deterministic** from the event, not the wall clock: e.g. `build-succeeded:<runId>`, `fork-error:<forkErrorId>`, `summary:<conversationId>:<summaryId>`, `reconnect:<sessionEpoch>`.
- **Never** put `Date.now()` at fine precision or per-tab randomness in the key — that silently defeats dedup. If an event has no natural stable id, derive the key from a coarse time bucket (e.g. minute) plus the semantic fields, and document the chosen window.
- `dedupeKey` is **required** (non-optional) on the input type so a caller can't forget it. The compiler becomes the reminder.
- Keep `notificationsResource.notify()` after the insert; on a conflict no-op it's a cheap redundant nudge, which is fine.

**PushAndExit.** Make the operation idempotent at the job/handler level: if the push-and-exit job is already terminal (clean/error) or already torn down, the DELETE is a no-op rather than re-running teardown. Then "did exactly one tab fire it" stops being a correctness question.

This layer alone protects the 9 known sinks. It does **not** protect future sinks (new endpoints, external APIs, agent launches) — those only get this property if their author adds it. That gap is what §2 and §3 close.

### §2 — Server-side reactions (Layer 1): the structural fix for Axis A

For every transition the server already observes, the reaction belongs server-side, where it fires once regardless of tab count. Use `defineTriggerEvent` / `trigger()` / `defineJob`.

| Current (client reactive) | Target (server reaction) |
|---|---|
| BuildButton effect → `toast("Build succeeded")` (#4, #5) | Build job completion → `recordNotification()` |
| ReconnectWatcher → `toast("Reconnected")` (#1) | WS/health server handler → `recordNotification()` |
| AutoLaunchWatcher → `toast("Created")` (#2) | Conversation-creation event → `recordNotification()` |
| ForkErrorWatcher → `toast(...)` (#3) | Fork-error recording path → `recordNotification()` |
| SummaryPane → `toast(...)` (#6) | Summary-arrival event → `recordNotification()` |
| PushAndExit effects → `fetch DELETE` (#7–9) | Push-and-exit job cleans up its own resource on terminal state |

After migration each client site keeps only its **ephemeral** UI toast (if any) and drops the persistence call entirely. The duplication is gone at the source; idempotency from §1 covers any residual races.

### §3 — Split `toast()` + lint tripwire (Layer 2): keep it from coming back

**Split `toast()`** into:

- `showToast()` — ephemeral UI only (`ShellCommands.Toast`), no DB write. Safe from anywhere, any tab.
- `recordNotification()` — server-only, **not exported from the web barrel** (already server-side; just stop the web path from writing).

This removes the footgun: the function that looked UI-only no longer hides a write.

> **Sequencing (this is the v1 bug):** do **not** split `toast()` first. After the split the 6 sites call `showToast()` and persist nothing — so if §2 hasn't landed for a given site, that notification type silently stops persisting. Correct order is per-site: build the server-side reaction (§2) → cut the site over → only then remove its client write. The split is the *last* step of §2, not a standalone quick win.

**Lint rule** — reframed from "guarantee" to "nudge." Flag `fetch` / `fetchEndpoint` / `mutate` / `invalidateQueries` (and the now-removed write path of `toast`) inside a `useEffect` that reacts to shared server state. Corrections vs v1:

- **Broaden the trigger.** Don't key only on closures capturing `useResource` results — site #1 reacts to `subscribeWsStatus` and would slip through. Include `subscribe*` subscriptions and resource values read via refs/props where detectable.
- **Fix the message.** Not "use a click handler" (half these have no click — build-finished, reconnect). Say: *"Server I/O inside an effect reacting to shared state fires in every open tab. Move it server-side (defineTriggerEvent/defineJob), or ensure the sink is idempotent."*
- **Bill it honestly.** This rule is an evadable heuristic (one level of indirection slips past it; AST detection of "reacts to a broadcast" is undecidable). It's the tripwire that catches an agent wiring a reaction to a *non-idempotent* sink — not the thing that makes the bug impossible. §1+§2 do the real work.

### Dropped: `useServerReaction` escape hatch

v1's Layer 4 (BroadcastChannel leader election so only one tab fires) is **not** in this plan. Its leader election is "usually once," not "exactly once" (leader closes mid-effect; no leader yet when the event lands; dual-leader races), and BroadcastChannel is per-origin so it only coordinates tabs within one worktree subdomain anyway. It would only ever be safe layered on §1's idempotent sink — at which point, for the cases that can't move server-side, "fire per-tab into an idempotent sink" is simpler and just as correct. Revisit only if a concrete client-only reaction appears that §1+§2 can't cover.

## Recommendation

Lead with the paired structural fix, trail with the tripwire:

1. **§1 idempotent sink** — unconditional; protects the 9 known sinks immediately and survives every later step failing. Required `dedupeKey` makes the compiler the reminder.
2. **§2 server-side reactions** — the real fix for Axis A; eliminates the N× I/O §1 can't. Migrate site-by-site.
3. **§3 split `toast()` + lint** — split as the *final* step of each §2 migration (not first); lint as an honestly-billed nudge against the next non-idempotent sink.

Dropping any of the three leaves a real hole: no §1 → leader races and missed sinks corrupt; no §2 → permanent N× load and total dependence on per-sink keys; no §3 → nothing flags the next non-idempotent reactive effect.

The honest claim is not "impossible to get wrong" — it's "**getting it wrong is harmless, and loud when it isn't covered.**" That's the stronger property.

---

## As-built (implemented 2026-06-02)

All three layers shipped. Deviations from the plan above, with reasons:

### §1 — idempotent sink ✅
- `_notifications` gained a nullable `dedup_key` column + `notifications_dedup_key_idx` UNIQUE index. `recordNotification` now inserts with `.onConflictDoNothing({ target: dedupKey })` and accepts `dedupeKey?` + optional explicit `id?` (the latter preserves the `recentClientIds` self-echo match for client-originated writes).
- **Unified the sink**: `handle-create` (the `POST /api/notifications` handler) no longer has its own insert — it calls `recordNotification`. There is now exactly one `insert(_notifications)` in the codebase.
- `dedup_key` is deliberately **not** on the wire — `notificationsResource`'s loader selects explicit columns so the client payload (`NotificationSchema`) is unchanged.
- **Verified live**: 3 POSTs with one `dedupeKey` → exactly 1 row.

### §2 — server-side reactions ✅
- **Build** (#4,#5): `recordNotification` in `run-build.ts` at the start (auto-only) and finish points; client effects removed from `build-button.tsx`.
- **Conversation auto-launch** (#2): new `conversations.notify-created` job bound to the `conversationCreated` event (filters `spawnedBy`); `auto-launch-watcher.tsx` deleted.
- **Fork error** (#3): `recordNotification` in the `forkDatabase().catch()` in `lifecycle.ts`. `fork-error-watcher.tsx` deleted — and since it was the *only* consumer, the entire `forkErrorsResource` / `reportForkError` machinery was removed.
- **Push-and-exit** (#7–9): clean-path notification + `clearJob` moved into `exit-clean-finalize-job` (the true terminal point); error-path into `handle-start`'s catch. The two reactive client effects (clean/error) were removed.
- **Reconnect** (#1): no server signal exists, so it stays client-side but now calls `ShellCommands.Toast` directly (ephemeral, per-tab) — **no DB write**. This is the correct semantics: reconnect is a per-tab event that needs no persistence.

### §3 — lint tripwire ✅, but NOT the `toast()` split
- New global rule `reactive-server-io/no-reactive-server-io` (in the tooling/lint global rules, enabled repo-wide as `error`). Conservative detection: a banned I/O call (`toast`/`fetchEndpoint`/`fetch`/`invalidateQueries`/`mutate`/`mutateAsync`) lexically inside a `useEffect`/`useLayoutEffect` whose deps/body are taint-linked to a shared-state hook (`useResource`/`subscribeWsStatus`/`useEndpoint`/`use*Resource`). Favors false-negatives over false-positives (a false positive breaks the build).
- **Deviation: `toast()` was NOT split into `showToast()`.** The plan's intent ("a client reaction can't accidentally persist") is already met by existing primitives: `ShellCommands.Toast` *is* the ephemeral-only sink, and `recordNotification` *is* the server-only persistent sink. `toast()` stays as the click-handler convenience (safe by construction — one tab gets the click); the lint rule guards reactive misuse. Splitting would have forced the ~25 safe click-handler callers into more boilerplate (or a server round-trip) for zero correctness gain.
- **Deviation: site #6 (summary) was dropped** from the migration — it's per-tab-gated (`pendingSince`), so it never duplicated across tabs; moving it server-side would have changed semantics (notify all tabs). Left as-is with a documented lint disable.
- **Three sanctioned client reactions** carry documented `eslint-disable` directives: summary-pane (per-tab gated), mutation-errors (per-tab-local mutation cache), and push-and-exit lost-process (idempotent `clearJob` no-op — kept client-side because the poller has no clean in-plugin hook).
- **Four read-amplification sites** (recovery-view, plugin-health ×2, docs-button `use-pushed-doc-files`) are flagged by the rule and carry documented disables: they are by-design per-tab view refreshes — each tab has its own query cache and must refetch on a live-state change; there is no cross-tab *write* to deduplicate. The rule surfacing them (rather than ignoring reads) makes the wasted-fetch cost explicit and justified rather than silent.
