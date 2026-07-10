# Root cause confirmed: oversized monolithic `push` live-state resources — the unbounded `notifications` blob foremost — drive the flush cascade, the snapshot TOAST bloat, AND the intermittent pool exhaustion

**Date:** 2026-06-29 (second session of the day)
**Status:** **root cause confirmed beyond doubt** with multiple converging lines of
evidence (live profile + DB facts + code). No code changes. Fix plan at the end.
**Supersedes / refines:** the earlier 2026-06-29 doc named *DB-pool exhaustion* as the
top confirmed cause. That is a **downstream, intermittent symptom**, not the driver —
see "Re-validation" below.

## TL;DR

The dominant cost is a handful of **oversized, monolithic `push`-mode live-state
resources** that load an entire unbounded table as one blob and re-serialize +
re-snapshot + re-deliver the *whole* blob on every change. The worst by an order of
magnitude is **`notifications`: 1.88 MB, 21,803 undismissed rows, loaded with no
`LIMIT`.** Each change to it:

1. re-runs `SELECT … WHERE dismissed=false ORDER BY created_at DESC` over 21.8k rows (≈590 ms),
2. UPSERTs the full 1.88 MB jsonb into `live_state_snapshot` — rewriting a large TOAST
   value every time, which has bloated that table's TOAST to **112 MB** (heap is 160 kB)
   and makes the write take **up to 4.95 s**, holding a DB connection the whole time,
3. broadcasts the full 1.88 MB array to every subscribed tab (`deliver:notifications`
   ≈ 3 s avg, 5.9 s max — the single slowest delivery).

During cold-boot fan-out (all resources re-subscribe at once) these mega-operations
pile onto the per-backend 16-connection pool / 10-slot loader gate and **intermittently
exhaust it**, head-of-line-blocking every other loader — including trivial queries
against an 88 kB table that then *appear* to take 2.5–3.5 s while merely waiting. That
is the earlier session's "DB-pool exhaustion" and "why do simple indexed queries take
47 s" — both are this contention, not slow queries.

The notifications blob grows without bound because the **reports monitoring system files
a notification per report** (281/hour, ~4.7/min) and the TTL sweep **never
auto-dismisses `warning`/`error` variants** — so report notifications accumulate forever
(21,085 rows since 2026-06-13). The performance-diagnosis infrastructure is feeding the
performance problem.

## Method

- `get_runtime_profile` on `singularity` (main), kinds `flush` / `push` / `db` —
  a fresh window captured from this backend's boot (atMs 5 s–736 s).
- `query_db` on `singularity` for table/TOAST sizes, notification counts and growth rate,
  and per-resource snapshot `value` sizes.
- An `Explore` pass over the code for the `notifications` resource, the report→notification
  insert path, the TTL job, and the DB pool / PgBouncer / loader-gate topology.

## Evidence

### A. `notifications` is a 1.88 MB monolith, and the largest of several big blobs

Per-resource `live_state_snapshot.value` size (`pg_column_size`):

| resource_key | value size | rows behind it |
|---|---|---|
| **`notifications`** | **1,880 kB** | 21,803 undismissed |
| `pushes` | 437 kB | — |
| `attempts` | 381 kB | 3,123 |
| `tasks` | 369 kB | 3,318 |
| conversation-categories | 60 kB | — |
| (everything else) | ≤ 54 kB | — |

The `notifications` loader (`plugins/shell/plugins/notifications/server/internal/resources.ts:8`)
is `mode: "push"` and runs `SELECT … FROM notifications WHERE dismissed=false ORDER BY
created_at DESC` — **no `LIMIT`, no pagination**. `push` mode has no diff/delta: every
change re-runs the full query and broadcasts the entire array
(`resource-runtime/core/runtime.ts:1502`).

### B. The TOAST bloat is real and caused by rewriting that blob

`live_state_snapshot`: **149 MB total = 160 kB heap + 16 kB indexes + 112 MB TOAST**,
for **20 live rows** (179 dead). The bloat lives entirely in the TOAST table — i.e. it
is the large jsonb `value` (notifications 1.88 MB, pushes/attempts/tasks ~0.4 MB) being
UPSERTed over and over, each rewrite orphaning the prior TOAST chunks. Autovacuum last
ran 2026-06-28 23:15.

### C. The big-blob operations dominate the profile

From the live window (all parented to `flushNotifies`):

- `live_state_snapshot` UPSERT — **max 4,950 ms** (avg 49 ms over 207 calls). The 4.95 s
  outlier is the notifications-sized write.
- `deliver:notifications` — **max 5,943 ms, avg 3,036 ms** — the slowest `push` delivery.
- `deliver:attempts` 5.3 s, `deliver:agent-launches` 5.2 s, `deliver:tasks` 5.1 s — the
  other big blobs, all clustered at atMs 6–10 s (boot fan-out).
- `select … notifications … dismissed=$1` — **591 ms** (full 21.8k-row scan).
- worst `flushNotifies` cycle — **21,760 ms**, at atMs 33 s (cold-boot fan-out).

### D. "Slow simple queries" are pure wait, not work

`SELECT id FROM "conversation_turn-completed_triggers" WHERE enabled=true AND
conversation_id=$1 LIMIT 1` — **14 of them, each 2.5–3.5 s, all issued within ~1 ms of
each other at atMs 5,479** (a thundering herd from boot trigger-replay). But that table
is **88 kB / 20 rows** — it cannot take 3 s to scan. These are 100 % wait
(connection/event-loop head-of-line), not execution. Same mechanism behind the prior
session's 47 s `update conversations` / `attempts_v` outliers.

### E. The growth driver: report→notification, no retention for warning/error

Notification rows by type:

| type | total | last 24 h | last 1 h |
|---|---|---|---|
| **`report`** | **21,085** | 1,909 | **281** |
| crash | 581 | 0 | 0 |
| task | 187 | 20 | 0 |
| conversation | 172 | 21 | 3 |
| build | 160 | 12 | 2 |
| mutation-error | 33 | 0 | 0 |

`recordReport()` files a notification for every non-rate-limited report
(`plugins/reports/server/internal/record-report.ts:175`), variant =
`spec.meta.variant` (`warning`/`error` for most kinds). The hourly TTL job
(`…/notifications/server/internal/ttl-cleanup.ts`) only auto-dismisses variants
`["info","success"]`, and only hard-deletes rows **already** dismissed for 7 days. So
`warning`/`error` report notifications are **never** auto-dismissed → the undismissed set
grows monotonically (oldest row 2026-06-13). At ~4.7 reports/min this is also the
**steady-state flush driver**: the profile's recurring ~828 ms flushes line up with the
constant notifications churn re-emitting the 1.88 MB blob.

### E2. The 26× blow-up is the notification dedup key, not distinct problems

Drilling into the 21,085 `report` notifications by `metadata->>'source'`:

| source | notif rows | last 1 h | distinct fingerprints (= real problems) |
|---|---|---|---|
| `server-slow-op` | 13,758 | 54 | **198** |
| `server-op-rate-monitor` | 6,421 | 142 | **42** |
| client-slow-op | 506 | 8 | — |
| (all else) | ~640 | 0 | — |

The `reports` table holds **820 rows = 820 distinct fingerprints** (one per distinct
problem — correctly bounded). The `notifications` table holds **21,125 undismissed report
rows** for those same 820 problems — a **~26× multiplier**. Cause: report notifications
are deduped by `(reportId, timeBucket)` (`record-report.ts`, the `${row.id}:${bucket}`
key for cooldown kinds), so each recurrence of a chronic slow-op/op-rate report in a new
time bucket **inserts a fresh notification row** instead of updating the existing one. One
chronically-slow op → ~55 notifications; one spiky endpoint → ~150.

**Refines fix #1:** the correct granularity is **one notification per report fingerprint**,
updated in place (bump `count` + `last_seen`), not one per time bucket. That collapses
21,125 → ~820 rows and the blob from 1.88 MB → ~75 kB (25×) — strictly *more* useful in the
UI ("slow 55×, last 2 min ago") and it fixes the snapshot UPSERT, TOAST bloat, and delivery
cost at the source.

### F. Pool topology (so we know the contention ceiling)

- Each worktree backend has its **own** `node-postgres` Pool, `max: 16`
  (`plugins/database/server/internal/client.ts:35`). Pools are **not** shared across
  worktrees; each worktree has its own forked DB.
- Backends connect through **PgBouncer** (`pool_mode = transaction`,
  `default_pool_size = 16`, `max_client_conn = 200`,
  `plugins/database/plugins/pgbouncer/scripts/start.ts:85`); embedded Postgres runs with
  `max_connections = 500` (`…/embedded/shared/internal/paths.ts:23`).
- Live-state loader queries are gated to **10 concurrent** per backend
  (`createSemaphore(POOL_MAX - RESERVED_INTERACTIVE)` = 16 − 6, `client.ts:56`), charged
  as `loader-acquire`. Snapshot UPSERTs and other non-loader work draw on the 6 reserved
  interactive slots.

So one backend's flush storm contends *within that backend* (10 loader slots + 6
interactive), not host-wide. A single 4.95 s snapshot write + 5.9 s delivery + the 14
piled-up trigger queries is enough to saturate it transiently — which is exactly the
intermittent `loader-acquire` spike the prior session caught at 243 s total.

## Re-validation of the prior session (this is why the method exists)

The earlier 2026-06-29 doc listed **DB-pool exhaustion** as the #1 *confirmed* cause
(`loader-acquire` 243,614 ms; `[acquire]` max 44.6 s over 95,465 acquires). In **this**
fresh window `[acquire]` max is **81 ms** (avg 1 ms over 1,788 acquires). The pool is
**not** chronically exhausted — it spikes only *during* the big-blob storms (cold boot,
notifications churn). Pool exhaustion is therefore a **downstream, intermittent symptom**.
The upstream cause is the oversized monolithic `push` resources. Both docs' raw numbers
are real; this session correctly orders cause→effect.

## Open questions — now answered

1. **What triggers the flush storms?** (a) Cold-boot fan-out — all resources re-subscribe
   at once; the worst flush (21.8 s), worst deliveries (5.9 s) and the 14-query trigger
   herd all sit at atMs 5–33 s. (b) Steady-state notifications churn — ~4.7 report
   notifications/min each re-emit the 1.88 MB blob (the recurring ~828 ms flushes). ✅
2. **Pool topology + limits.** Per-backend Pool max 16 → PgBouncer transaction mode,
   default_pool_size 16, max_client_conn 200; PG max_connections 500; loader gate 10.
   Contention is **per-backend**, not host-wide. ✅
3. **Is `live_state_snapshot` bloat causal?** Yes. 112 MB is TOAST from rewriting the big
   jsonb values; the 4.95 s UPSERT is the notifications-sized write holding a connection
   mid-flush. Causal, not merely correlated. ✅
4. **Why do simple indexed queries take seconds?** They wait, they don't execute — the
   88 kB / 20-row trigger table can't scan for 3 s. Head-of-line behind the storm. ✅
5. **True cold boot.** Captured here: this profile starts at backend boot; the atMs
   5–33 s region *is* the cold-boot fan-out and reproduces the original ~7 s+ symptom
   (21.8 s worst flush). ✅

## Fix plan (root cause, not symptom — to be confirmed with the user before building)

In priority order. The first two attack the cause; the rest harden the class.

1. **Bound notification retention + dismissal (kills the 1.88 MB blob).**
   - Auto-dismiss **all** variants past a TTL (or at least `warning`/`error` report
     notifications), not just `info`/`success`. Report notifications are transient signals,
     not a permanent ledger.
   - Backfill: dismiss the existing 21.8k undismissed report rows, then `VACUUM (FULL)`
     `live_state_snapshot` to reclaim the 112 MB TOAST.
   - Reconsider filing a *notification per report at all* — the reports pane already lists
     them; a single rolled-up "N new reports" notification would remove the firehose.
2. **Cap / paginate the `notifications` resource.** Add a `LIMIT` (e.g. most-recent 50
   undismissed) so the blob can never grow unbounded even if retention regresses. The bell
   UI shows a capped recent list anyway.
3. **Class fix — no unbounded `push` resource.** `attempts` (381 kB/3.1k rows),
   `tasks` (369 kB/3.3k rows), `pushes` (437 kB) are the same anti-pattern waiting to
   bite. Options: move large/growing sets to `keyed` mode (diff/delta delivery instead of
   full re-broadcast), or enforce a `LIMIT`/window. Consider a lint/check that flags a
   `mode:"push"` resource whose loader has no `LIMIT` over a growing table.
4. **Decouple snapshot TOAST churn.** Even bounded, rewriting a multi-hundred-kB jsonb on
   every flush bloats TOAST. Consider skipping the snapshot UPSERT when the value is
   unchanged (content hash), or storing large snapshots out-of-line.

## Implemented (this session, on branch `claude-web/att-1782688472-pstx`)

Fixes #1 + #2 of the plan — attacking the cause. Not yet pushed to main.

- **One notification row per report fingerprint.** `record-report.ts` now keys the
  bell notification by the stable `row.id` (always), dropping the `(reportId,
  timeBucket)` key that caused the ~26× row blow-up. The kind's `notifCooldownMs` is
  passed as the new `resurfaceAfterMs` re-surface window instead of a key component.
- **`recordNotification` gained count + in-place re-surface.** New `count` and
  `lastSeenAt` columns (schema migration `notifications_count_lastseen`). Every dedup
  hit bumps `count` + `lastSeenAt`; with `resurfaceAfterMs` set, a hit on a row that
  last surfaced longer ago than the window re-surfaces it in place (reset
  `read`/`dismissed`, bump `createdAt`) — preserving the "re-alert without spam" intent
  with **one** row. No-cooldown kinds (crash) never resurface, as before.
- **TTL sweep closes the warning/error gap.** `ttl-cleanup.ts` now also auto-dismisses
  `type='report'` rows whose `lastSeenAt` is older than 24 h, so a fingerprint that
  stopped firing falls away while an active one stays surfaced.
- **Bell UI** shows `×N` when `count > 1` and uses `lastSeenAt` ("last seen") for the
  timestamp.
- **One-time backfill** (data migration `dismiss_legacy_report_notifs`):
  `UPDATE notifications SET dismissed=true WHERE type='report' AND dismissed=false`.

**Verified on the worktree DB (a fork of main):**
- backfill dropped undismissed report notifications **21,803 → 1**; the `notifications`
  live-state snapshot `value` collapsed **1.88 MB → 39 kB** (48×).
- deterministic dedup test: 3 identical POSTs to `/api/reports` (same fingerprint)
  produced **one** row with `count=3`, `created_at` pinned to the first occurrence,
  `last_seen_at` advanced — and (crash kind, no cooldown) correctly did **not** resurface.

### Remaining
- **Post-merge: `VACUUM (FULL, ANALYZE) live_state_snapshot` on `singularity`.** The
  112 MB TOAST bloat is on main only (the worktree fork was clean at 2.6 MB). Run it
  **after** this lands on main and the data migration shrinks the live value, else it
  re-grows. `VACUUM FULL` can't run inside the migration transaction, so it's a manual
  maintenance step, not a migration.
- **Class fix (#3) deferred:** `attempts`/`tasks`/`pushes` are the same unbounded
  `mode:"push"` pattern (0.4 MB each, growing). Worth a `keyed`-mode migration or a
  lint/check flagging an unbounded `push` loader. Not done here to keep this change
  scoped to the confirmed dominant cause.

## Raw data (this session)

- Profiles: `get_runtime_profile` singularity, kinds flush/push/db (window atMs 5 s–736 s).
- DB: `live_state_snapshot` 149 MB (112 MB TOAST); `notifications` value 1.88 MB / 21,803
  undismissed; 21,085 `report` rows, 281 in last hour; per-backend pool max 16, loader
  gate 10.
