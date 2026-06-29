# No-op-push churn — the layered fix validated on `singularity` (the deferred behavioral confirmation)

**Date:** 2026-06-29 (sixth session of the day)
**Status:** **Confirmed fixed on `main`/`singularity`.** Session 5 implemented both altitudes
(boundary invariant + origin cure) but could only verify them *structurally* in a worktree — the
poller's orphan adoption is `isMain()`-only, so the behavioral rate-drop could not reproduce off
`singularity`. The fix has since landed on main (`1f6b27092 perf(live-state): kill no-op-push churn
at origin + boundary invariant`). This session closes that deferral: re-measured `singularity`
live, and **all three independent lines of evidence converge** on the churn being gone.

## Phase 0 — re-validated on the real target, did not inherit

The session-5 doc's conclusion was a hypothesis until measured on `singularity`. Confirmed the fix
commit is on main and the worktree merge-base includes it, then measured the live system — not the
commit message.

## Three converging lines of evidence

### 1. Profile (`get_runtime_profile`, worktree `singularity`)
- **`flushNotifies`: max 22.4 s → 571 ms, avg 77 ms, `workMs == avgMs` (zero wait).** The
  multi-second flush stalls — the headline symptom sessions 1–3 fixated on — are gone. Every flush
  is now pure work under 0.6 s.
- **No `[acquire]` pool-wait entry in the top DB aggregates at all.** In session 2 `loader-acquire`
  was 243,614 ms and dominated; it is now negligible enough to fall off the board. Pool exhaustion
  was a symptom of the big-blob storms, exactly as session 2→6 reclassified it.
- **`push` deliveries all sub-400 ms, work-only:** `deliver:notifications` max 293 ms (was 5.9 s in
  session 2), `deliver:attempts` max 401 ms, `deliver:tasks` max 206 ms. No head-of-line wait — the
  serial flush no longer has a 21.9 s UPSERT to block behind.

### 2. DB / data facts (`query_db`, `singularity`)
- **`live_state_changelog` last 5 min: `conversations` INSERT = 0.003/sec, and ZERO NULL-id
  statements across every table.** Down from session 5's **4.0/sec, 1200/1201 NULL-id**. The
  boundary invariant (zero-row statement → no notify) is holding live: the `job_steps`/`job_waits`
  zero-row DELETEs session 5 newly surfaced are gone from the changelog too.
- **`live_state_snapshot`: 155 MB → 14 MB total** (TOAST 14 MB total / 7984 kB heap, 369 live + 792
  dead TOAST tuples; table `n_dead_tup` 11 k → 7). Autovacuum ran at 12:08 and **reclaimed the bloat
  on its own once the churn stopped feeding it** — the deferred one-time `VACUUM FULL` turned out to
  be unnecessary. `n_tup_upd` is essentially flat (3.058 M → 3.102 M) and now grows at the real
  flush rate (~0.18 flush/s), not the old ~12 no-op-recompute/s.
- **`conversations.n_tup_ins` flat at 2,294** (session 5: 2,285) — still no real insert churn; the
  +9 are genuine new conversations.
- **`live-state-noop` report last fired 11:29** — >40 min stale at measurement time (autovacuum
  timestamp 12:08 proves "now" is past noon). Before the fix it re-surfaced continuously. Cumulative
  occurrences frozen at 32,791 (≈ session 5's 32 k). AMPLIFIER 2 (invalidation → no-op recompute) is
  extinguished because its upstream FULL invalidations are gone.

### 3. Code path
- `1f6b27092` carries both altitudes. The **boundary invariant** in `live_state_notify()`
  (`change-feed/server/internal/triggers.ts`) early-returns on an empty transition table. The
  **origin cure** in `conversations/server/internal/poller.ts:97–99` gates orphan adoption through
  the new bounded `listExistingConversationIds(candidates)` so a `done`-but-live session is adopted
  at most once.

## The residue is exactly what the method predicted — named, not crowned

The new most-frequent recurring DB op is `select "id" from "conversations" where "id" in
($1,$2,$3,$4)` — **count 423 (~1.2/sec), avg 7 ms work**. This is the very `listExistingConversationIds`
call the origin cure added (`poller.ts:98`), running each 1 Hz tick over the ~4 done-but-live
host-wide tmux sessions. It returns the 4 known rows, so `orphans = []` and **nothing is written**.

Stopping gates on this node:
- **Gate 2 (legitimacy): fails.** A 1 Hz poll re-checking the same settled sessions every second is
  illegitimate work (the no-polling rule). The true origin is still one hop up: the poll itself.
- **Gate 3 (counterfactual):** session 5 bought *containment of the amplification* (no more FULL
  invalidation / no-op cascade / snapshot UPSERT) **plus a cure of the misclassification's write**
  (the zero-row INSERT is gone). It did **not** cure the poll — the poll still fires and now does a
  cheap PK-indexed SELECT instead of a conflicting INSERT.
- **Gate 4 (requirement boundary):** curing the poll means event-driven tmux-death detection, which
  has no push signal today — a separate redesign. The residue is now cheap (7 ms, PK seek, no
  write, no invalidation), so fixing it costs more than it saves right now.

So the residue is **acknowledged containment**, not a missed root. The wasted work was made *not
happen* where it mattered (the cascade) and *harmless* where it remains (the existence check).

## What this closes

- **The session-5 deferral is resolved:** behavioral rate-drop confirmed on `singularity`.
- **One-time `VACUUM (FULL, ANALYZE) live_state_snapshot` — no longer needed.** Autovacuum reclaimed
  155 MB → 14 MB once the no-op UPSERT firehose stopped. Closing this follow-up; reopen only if the
  table re-bloats (it should not, absent the churn).
- **Persist-skip** (`research/2026-06-29-global-skip-unchanged-snapshot-persist.md`) — remains pure
  defense-in-depth (now there is no no-op UPSERT stream for it to skip). Low priority.

## Still open (unchanged, separate work)

- **The 1 Hz poller itself** — the genuine remaining origin, now reduced to cheap harmless work.
  Event-driven liveness is a bounded redesign (tmux death has no push signal). Flag, not a current
  perf driver.
- **Cold-boot fan-out** — the only sub-1 s-budget violations left are boot-herd outliers
  (`conversations in()` 2.58 s and `tasks_v` 0.88 s at atMs 5–15 s, while all resources re-subscribe
  at once). Steady state is well within budget; the boot herd is the next legitimate target if the
  `< 1 s including cold start` goal is pursued further. Already catalogued under "Cold boot".
- **Class hardening** — a check/lint flagging an unbounded `mode:"push"` resource over a growing
  table (the deeper structural guard). Separate.
