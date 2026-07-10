# Re-validation after the notifications fix: the dominant cost is now `live_state_snapshot` TOAST bloat (181 MB / 20 rows), driven by unconditional full-blob UPSERTs on no-op pushes — plus the deferred one-time `VACUUM FULL` that was never run

**Date:** 2026-06-29 (third session of the day)
**Status:** **root cause of the current dominant symptom confirmed beyond doubt** (live
profile + DB facts + code). No code changes. Fix plan at the end, pending user go-ahead.
**Builds on:** the [notifications root-cause session](./2026-06-29-notifications-unbounded-resource-root-cause.md),
whose fix (one notification row per fingerprint) **landed on main** (`a8f9da4b6`).

## Re-validation of the prior fix (the method requires it)

The notifications fix worked, measured on `singularity` (main) this session:

| metric | before (session 2) | now | change |
|---|---|---|---|
| `notifications` snapshot `value` | 1.88 MB | **42 kB** | **45× smaller** |
| undismissed `report` notifications | 21,803 | **27** | bounded |
| `deliver:notifications` max | 5,943 ms | **341 ms** | no longer a top delivery |

So the *worst* monolithic blob is gone. But the headline symptom — multi-second flush
stalls — **persists**, now driven by the layer underneath it.

## TL;DR — the new dominant cost

The single worst event in a fresh ~5.7 min window on `singularity` is a **22.4 s
`flushNotifies` cycle** (atMs ≈ 331 s — steady-state, not boot). Drilling in: that whole
cycle is **one `live_state_snapshot` UPSERT that took 21,919 ms** (the same op averages
**26 ms** over 1,503 calls — a lone outlier). Because `flushNotifies` serializes the
snapshot writes, that one stalled UPSERT head-of-line-blocked every resource in the cycle,
so `conversations-gone/active/system`, `jsonl-events`, `edited-files` and `attempts` all
show ~22 s *delivery* latency — they were waiting, not working.

Why can one UPSERT stall for 22 s? **`live_state_snapshot` is 181 MB of TOAST for 20
logical rows** — pure bloat (11,004 dead TOAST tuples, ~3.0 M lifetime `n_tup_upd`,
`last_vacuum = null`). A single jsonb UPSERT into a TOAST table that bloated can stall for
seconds under an autovacuum/checkpoint collision. **The deferred post-merge
`VACUUM (FULL) live_state_snapshot` from session 2 was never run**, and the bloat has even
grown since (112 MB → 181 MB).

The bloat keeps growing because of a structural gap: **the runtime UPSERTs the full
snapshot value on every flush unconditionally — including no-op pushes where the recomputed
value is byte-identical to the stored one.** The churn monitor proves this is rampant: six
keyed resources each fire **~2.0 no-op pushes/sec**, sustained, each rewriting its full
0.4 MB-ish blob into the bloated TOAST for zero value change.

## Evidence

### A. The new top blobs and the persisting bloat

Per-resource `live_state_snapshot.value` size now (notifications has collapsed out of the
top tier):

| resource_key | value size |
|---|---|
| `pushes` | 438 kB |
| `attempts` | 381 kB |
| `tasks` | 369 kB |
| conversation-categories | 60 kB |
| conversation-progress | 54 kB |
| `notifications` | **42 kB** (was 1.88 MB) |
| (everything else) | ≤ 37 kB |

`live_state_snapshot` table facts (`pg_stat_user_tables` + TOAST):

- heap **160 kB**, TOAST **181 MB**, **20 live rows** (was 112 MB TOAST in session 2 — *growing*).
- TOAST table: **131 live / 11,004 dead** tuples.
- **`n_tup_upd` = 2,994,169** (≈3 M), almost all HOT — i.e. ~3 M UPDATEs each rewriting a
  large jsonb value and orphaning its prior TOAST chunks.
- **`last_vacuum = null`** (manual VACUUM FULL never run); `last_autovacuum` 2026-06-29 00:01,
  which cannot keep up with the rewrite rate.

### B. The 22 s flush is one stalled snapshot UPSERT

`get_runtime_profile` (singularity, kinds flush/push/db):

- `flushNotifies` — avg **361 ms**, max **22,379 ms** (one outlier at atMs 331 460).
- `live_state_snapshot` UPSERT (the 2-table-read variant) — avg **26 ms** over 1,503 calls,
  **max 21,919 ms** at atMs 331 051, parent `flushNotifies`. This *is* the stall.
- Every resource delivered in that cycle inherits ~22 s: `deliver:conversations-gone`
  22,163 ms, `…-active` 22,162 ms, `…-system` 22,162 ms, `deliver:jsonl-events` 22,154 ms,
  `deliver:edited-files` 22,152 ms, `deliver:attempts` 21,976 ms — all `workMs == avgMs`
  with the max pinned to the same flush. Pure serialization wait behind the one UPSERT.
- For contrast, `deliver:notifications` max is **341 ms** and `deliver:tasks` **546 ms** —
  they did not happen to sit in the stalled cycle. The stall is the *table*, not any one key.

### C. The churn driver — no-op pushes rewriting the blob

`reports` table on singularity, kind `live-state-noop` (the redundant-push monitor), all six
fingerprints sustained at the cap:

| resource_key | message | occurrences (`count`) |
|---|---|---|
| `tasks` | ~2.0 no-op pushes/s (×118/60s) | 5,387 |
| `attempts` | ~2.0 no-op pushes/s (×118/60s) | 5,383 |
| `conversations-system` | ~2.0 no-op pushes/s | 5,346 |
| `conversations-gone` | ~2.0 no-op pushes/s | 5,343 |
| `agent-launches` | ~2.0 no-op pushes/s | 5,328 |
| `conversations-active` | ~1.9 no-op pushes/s | 5,326 |

`live-state-noop` totals **32,107 occurrences** across these 6 keys. These are *keyed*-mode
resources, so their **delivery** correctly ships an empty diff (cheap) — but their
**persist** does not: see D.

### D. The structural gap — persist is unconditional and precedes the diff

`plugins/framework/plugins/resource-runtime/core/runtime.ts` `drainEntry`:

- Lines **1404–1419**: on loader success the runtime captures a watermark and calls
  `persistSnapshot(entry.key, pk, value, …)` **unconditionally** for every boot-critical
  resource — gated only on `bootCritical` membership, never on whether `value` changed.
- The no-op/"changed" determination happens **afterward**, in the keyed-diff delivery block
  (lines 1474–1500): `diffKeyed` yields empty `upserts/deletes` ⇒ `onPush({changed:false})`
  ⇒ nothing delivered. By then the full-blob UPSERT has **already** run.
- `plugins/database/plugins/live-state-snapshot/server/internal/persist.ts` `persistSnapshot`
  is a plain `INSERT … ON CONFLICT DO UPDATE SET value = EXCLUDED.value …` — **no comparison
  to the stored value**.

So every one of the ~12 no-op pushes/sec (6 keys × ~2/s) performs: a `pg_snapshot_xmin`
round-trip + a full 0.4 MB-ish jsonb UPSERT into the 181 MB bloated TOAST — for a value that
did not change and was not delivered. That is the ~3 M `n_tup_upd` and the bloat.

Note the precedent for safety: the runtime *already* skips the persist when watermark capture
fails (lines 1380–1386, "keeps its prior, older floor … still serve subscribers"). Skipping
the persist on an unchanged value is safe by the identical argument — replaying catch-up from
a slightly older floor recomputes the same unchanged value.

## Root cause (cause→effect ordered)

- ✅ **DRIVER: unconditional full-value snapshot UPSERT on every flush, including no-op
  pushes.** The persist path has no "value unchanged" guard and runs before the diff that
  would reveal the no-op. 6 keyed resources × ~2 no-op pushes/s ⇒ ~12 full-blob TOAST
  rewrites/s for zero value change (32 k logged `live-state-noop` occurrences).
- ✅ **EFFECT 1 — `live_state_snapshot` TOAST bloat.** ~3 M lifetime UPDATEs of 0.4 MB jsonb
  values ⇒ 181 MB TOAST / 20 live rows / 11 k dead TOAST tuples; autovacuum can't keep pace.
- ✅ **EFFECT 2 — multi-second flush stalls.** A single UPSERT into the bloated TOAST stalled
  21.9 s; because `flushNotifies` serializes, that one write inflated every co-flushed
  resource's delivery to ~22 s. This is the residual "pages take seconds" symptom after the
  notifications blob was removed.
- ✅ **AGGRAVATOR — the deferred one-time `VACUUM FULL` was never run.** Session 2 flagged it
  as post-merge maintenance; `last_vacuum = null` confirms it didn't happen, so 181 MB of
  historical bloat sits there on top of the ongoing churn.

## Fix plan (root cause, not symptom — pending user go-ahead)

In priority order. (1) is a one-time reclaim; (2) is the durable structural fix that stops
the re-bloat; (3)/(4) harden the class.

1. **One-time: `VACUUM (FULL, ANALYZE) live_state_snapshot` on `singularity`.** Reclaims the
   181 MB TOAST → a few MB and removes the 22 s-UPSERT hazard immediately. *Cannot* run via
   the read-only `query_db` MCP tool or inside a migration (VACUUM FULL can't run in a
   transaction) — it is a manual maintenance command the user must run against main's DB
   (e.g. `psql … -c 'VACUUM (FULL, ANALYZE) live_state_snapshot;'`). **Do it AFTER (2) lands**,
   else the churn re-bloats it.
2. **DURABLE: skip the snapshot UPSERT when the value is unchanged.** In `drainEntry`, before
   calling `persistSnapshot`, compare the new value against the last persisted one (cheapest:
   an in-memory `lastPersistedHash` per `(key, pk)` — a content hash — so a no-op pays neither
   the `pg_snapshot_xmin` round-trip nor the UPSERT). Skipping is already proven safe by the
   existing watermark-failure skip path. This collapses ~12 TOAST rewrites/s → ~0 in steady
   state and stops the bloat at its source. Lives in load-bearing `resource-runtime` — treat
   with care; the comparison must be byte-faithful to the serialized jsonb to avoid false
   "changed".
3. **CLASS FIX (carried from session 2 #3): bound / keyed the remaining big push resources.**
   `pushes` (438 kB), and the still-large `attempts`/`tasks` (≈0.4 MB) — even with (2), a
   *real* change rewrites the whole blob. Confirm these are keyed (they emit empty diffs, so
   likely yes) and, if any are `mode:"push"`, migrate to keyed/diff or add a `LIMIT`/window.
4. **HARDEN: a check/lint flagging an unbounded `mode:"push"` loader over a growing table**
   (also carried from session 2). And consider whether `persistSnapshot` should store/compare
   a value hash column so the unchanged-skip is enforced at the persistence boundary, not only
   in the runtime.

## Raw data (this session)

- Profiles: `get_runtime_profile` singularity, kinds flush/push/db/loader (window atMs 46 ms–
  ~346 s). Worst flush 22,379 ms; worst snapshot UPSERT 21,919 ms (avg 26 ms / 1,503 calls).
- DB: `live_state_snapshot` heap 160 kB / TOAST **181 MB** / 20 live rows / 11,004 dead TOAST
  tuples / `n_tup_upd` 2,994,169 / `last_vacuum` null. `notifications` value 42 kB, 27
  undismissed report rows. `reports` kind `live-state-noop` = 32,107 occurrences over 6 keys
  (~2/s each).
- Code: `resource-runtime/core/runtime.ts` `drainEntry` (persist lines 1404–1419, diff lines
  1474–1500); `live-state-snapshot/server/internal/persist.ts` `persistSnapshot` (unconditional
  UPSERT, no value compare).
