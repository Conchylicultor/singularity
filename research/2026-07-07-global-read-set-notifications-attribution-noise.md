# Read-set attribution noise: `notifications` leaks into unrelated loaders' read-sets

Date: 2026-07-07
Scope: global (runtime-profiler read-set capture; report/notification observability path)

## Symptom

`GET /api/resources/_debug` reports `notifications` inside the `readSetBases` of
`attempts` (and, non-deterministically, `tasks` / `agent-launches`) — none of
whose loaders read the notifications table. Consequence: the Debug → Read-set
ceiling pane raises a false **"silent FULL recompute"** warning chip for those
healthy resources (`notifications` sits outside their `coveredOrigins`), eroding
trust in the pane. Reproduces identically on `main` and worktrees; pre-existing.

Empirically on `main`:

```
attempts   readSet: [attempts_v, conversations_v, notifications]
           readSetBases: [attempts, conversations, notifications]
           coveredOrigins: [attempts, conversations]   ← notifications is OUTSIDE → false flag
```

The tell: a healthy loader reads **views** (`attempts_v`, `conversations_v`);
`notifications` appears as a bare **base table**. That is the fingerprint of a
foreign `INSERT INTO "notifications"` captured via the `into "…"` branch of the
read-set SQL extractor — not a `SELECT … FROM` a loader ever issued.

## Mechanism (root cause)

1. Read-set capture (`plugins/database/server/internal/client.ts`,
   `installQueryWrapper`): for any query issued while
   `currentCallerKind() === "loader"`, the pool wrapper calls
   `recordReadTables(extractTablesFromSql(text))`. `extractTablesFromSql` matches
   table identifiers after `FROM | JOIN | INTO | UPDATE | DELETE FROM` — i.e. it
   captures **write targets** as well as reads. `recordReadTables`
   (`runtime-profiler/core/recorder.ts`) unions those names into the innermost
   open `EntryContext.tables`, which `recordEntrySpan` flushes into the global
   `readSetIndex` under the loader's key when the entry finishes — but only for
   `kind === "loader"`.

2. The report/notification path (`plugins/reports/server/internal/record-report.ts`):
   the `_reports` upsert is deliberately wrapped in `runWithoutProfiling` (so the
   observability subsystem never measures its own I/O and never re-enters the
   slow-op/report self-feedback loop). But the very next statement —
   `void recordNotification({...})`, an `INSERT INTO "notifications"` — is **not**
   wrapped. It runs unsuppressed.

3. The trigger that puts step 2 inside a loader's ambient context: a slow `db`
   span *inside* a heavy loader body. `record()` in the recorder fires
   `onSlowSpan` subscribers **synchronously**; the slow-ops subscriber does
   `void recordSlowOp(...)`, whose detached async chain
   (`recordSlowOp → recordReport → void recordNotification`) inherits the loader's
   `EntryContext` via AsyncLocalStorage. For the heaviest loader (`attempts`: cold
   `[acquire]`, nested conversation join, `live_state_snapshot` write), the
   `EntryContext` stays open long enough for the notification INSERT to execute
   before the loader's `recordEntrySpan` `finally` flushes — so `notifications`
   lands in `readSetIndex["attempts"]`. Which loader (if any) is open when a given
   report fires is timing-dependent, which is why the leak floats across
   `attempts` / `tasks` / `agent-launches`.

`notifications` itself has no `identityTable` and `recompute: full`, so the leak
is strictly a *false extra edge* on the reader side, never a missed edge on the
notifications side.

## Fix

Two complementary, independently-justified structural fixes. Neither masks a
symptom; each closes a class.

### Fix A — the notification write is observability output; suppress it

`record-report.ts`: wrap the fire-and-forget bell write in the same
`runWithoutProfiling` scope its sibling `_reports` insert already uses:

```ts
void runWithoutProfiling(() => recordNotification({ ... }));
```

Suppression propagates across the detached async chain (AsyncLocalStorage
semantics), so the INSERT is never captured into any loader's read-set **and**
can never re-enter the slow-op → report → notification self-feedback loop (the
exact hazard the adjacent `_reports` suppression exists to prevent). This closes
the leak at its source and restores suppression-scope consistency: every write on
the report path (`_reports`, `slow_ops`, and now `notifications`) is suppressed.

### Fix B — a read-set contains only tables that were READ

`client.ts`: narrow the extractor (`extractTablesFromSql` →
`extractReadTablesFromSql`) to match only `FROM` / `JOIN` — the read clauses —
and drop `INTO` / `UPDATE` / `DELETE FROM` (write targets). Loaders are read-only
by contract, so any write-target table captured under a loader's ambient context
is *by definition* a foreign observability leak and never belongs in a read-set.
This makes the entire write-leak class structurally impossible — timing-
independent and suppression-independent — and is simply more correct: a
"read-set" should not name write targets. Covered by a co-located bun:test.

## The read-set is persisted and re-seeded — A+B alone can't evict the baked-in entry

Verified after deploying A+B: `attempts.readSet` **still** contained
`notifications`, even though no notification `db` span was recorded post-restart
(so A+B *are* working — the write is now suppressed and never re-captured).

The reason: the read-set index is **append-only, persisted, and re-seeded on
boot**:

- `readSetIndex` (`runtime-profiler/core/recorder.ts`) only ever `add`s — live
  capture, `seedReadSetIndex`, and every recompute union in; nothing evicts
  (except a full `resetRuntimeProfile`).
- The resource runtime persists `getReadSetIndex()[key]` into
  `live_state_snapshot.tables_read` on every snapshot write.
- `live-state-snapshot` boot-init calls `seedReadSetIndex(...)` from that column
  *before the readiness barrier*, so `catch-up` has a `table → resource` inversion
  at cold boot.

So a one-time misattribution baked into `tables_read` (captured before A+B)
survives forever: seeded on boot → union-preserved through every recompute →
re-persisted. Confirmed: `live_state_snapshot.tables_read` for `attempts` =
`["attempts_v","conversations_v","notifications"]`.

Functionally the stale edge is **safe** — `catch-up` inverts read-set → resource,
so a stale `notifications → attempts` edge only causes a *wasteful FULL recompute*
of `attempts` when `notifications` changes during downtime (over-approximation,
never staleness). Its only real harm is the false debug-pane flag. But it must be
evicted for the symptom to clear.

### Fix C — the table's owner asserts its sole-reader invariant (evicts the stale edge)

Removing a table from a resource's read-set is safe **iff** the resource does not
actually read it — it can only drop a spurious recompute trigger, never cause
staleness. Generic auto-eviction is unsafe (a read-set legitimately exceeds
`coveredOrigins` — that's the whole point of the silent-FULL signal — so nothing
declared can distinguish a stale entry from a conditional read). But the *owner*
of a table can: the `notifications` resource is the **sole** legitimate reader of
the `notifications` table (`queryResource`, `recompute: full`, one resource).

So the notifications plugin asserts that invariant on boot via a generic
`live-state-snapshot` primitive `reconcileReadSetTable(db, table, keepKeys)` that
(1) `array_remove`s the table from every persisted `tables_read` whose
`resource_key ∉ keepKeys`, and (2) removes it from the in-memory `readSetIndex`
for those keys (a small `removeReadSetTable` recorder API). Called in the
notifications server's `onReady` (after `live-state-snapshot`'s `onReadyBlocking`
seed) with `("notifications", ["notifications"])`. This is a *durable invariant
guard*, not a one-off cleanup: it corrects the historical corruption and would
catch any future regression on the same table, and it lives with the domain that
owns the knowledge — no feature-table name in generic infra.

## Adjacent gaps found while tracing (filed as follow-ups, not fixed here)

- **Cascade reads are omitted from read-sets and bypass the loader DB gate.**
  `cascadeDownstream()` runs each edge's `signature` / `affectedMap` DB queries
  *after* the origin's `wrapOrigin("push", …)` has resolved, under the enclosing
  `flush` entry (`kind === "flush"`). The pool wrapper's strict
  `currentCallerKind() === "loader"` check means those reads are captured by
  **no** resource's read-set and skip `loaderDbGate` entirely. This is a *missing
  edges* + *ungated cascade load* gap, opposite in direction to this bug —
  separate task.

- **`recordReadTables` does not check `EntryContext.closed`.** A detached
  continuation can append to a finished loader's `tables` after its single flush
  (silently lost today; latent footgun). A `!cur.closed` guard would make late
  writes to a closed context a structural no-op.
