# The ledger's walk bound is a coverage frontier, not an insertion frontier

Date: 2026-08-27
Category: tasks (tasks/tasks-core)

The follow-up the I6 doc filed against itself
(`research/2026-08-20-tasks-attempt-status-positive-evidence.md`, first bullet under
*Follow-ups*). I5 made the `pushes` table a projection of `main`; this fixes the two
places where that projection could permanently lose a commit.

## The symptom

A commit lands on `main` with its `Singularity-Conversation` trailer. This database has
no conversation row with that id yet, so `plan.ts` cannot attach a `pushes` row without
breaking the FK, and returns nothing for it. Later the poller adopts the orphan session
and `adoptOrphanConversation` synthesises the conversation — the commit is now
attributable. It is never inserted. Not late, not eventually: never.

Downstream that is not cosmetic. `attempts_v.status` reaches `completed` only through a
`pushes` row, and `task_blocking_v` blocks dependents on the absence of a completed
attempt — so one missing row keeps dependent tasks blocked and their armed auto-start
from ever firing, with nothing anywhere reporting a failure.

## The two halves of the defect

**1. The bound was an insertion frontier.** `reconcilePushLedger` walked back to
`max(pushes.created_at) - 24h`, on the reasoning that anything older is already
recorded. That is only true if a commit the walk declined to insert is one it will
*never* insert. `plan.ts` returned the same nothing for two different observations —
"foreign, this instance will never own it" and "not mine yet" — and the watermark
treated both as covered. A textbook absorbed failure: the second meaning has no
spelling, so no caller can act on it, and the ledger's own progress is what buries it.

**2. The memo signature covered only one of two inputs.** `freshness.ts` signed on
`main`'s tip. But `reconcile` reads git history *and* this database's conversation set,
and `createGitStateMemo`'s contract is explicit that the signature "must fingerprint
every input the result depends on". So even with a correct bound, the adoption that made
a commit attributable did not invalidate anything: the ledger stayed incomplete until
`main` happened to move for an unrelated reason. On a quiet repo that is an unbounded
wait for a fact that is already true.

## The invariant, restated

> **I5.** The `pushes` table covers every trailer-bearing commit reachable from
> `refs/heads/main` *that this database can attribute*. "Cannot attribute yet" is a
> state the walk must re-visit, never a conclusion it may record. The walk bound is
> therefore a statement about **coverage** — how far back commits are re-offered — not
> about **insertions**.

## Design

### 1. A coverage frontier (`push-ledger/walk-bound.ts`)

Pure, no DB and no git, so the policy is pinned by its own test:

```ts
ledgerWalkStart(newestRecorded, now) =
  newestRecorded === null
    ? null                                                    // empty ledger: whole history
    : min(newestRecorded - WATERMARK_PAD_MS, now - DEFERRAL_HORIZON_MS)
```

Two bounds, each covering what the other cannot, so the earlier wins. The 24h pad is the
**catch-up** half — a backend down for a month must walk that month, which the horizon
alone would not reach. The 30-day horizon is the **deferral** half — a ledger written to
a minute ago must still re-offer what it could not attribute, which the watermark alone
would not reach.

The residual policy is stated rather than pretended away: a commit unattributable for
longer than 30 days *is* treated as foreign. No finite bound can also be exact; the
honest move is to name the horizon. The number is picked by cost — measured on this repo,
30 days is ~390 commits / ~80 KB of `git log` output against ~3700 / ~720 KB for the whole
history, and it stays constant as the repo grows, which is what keeps the walk on the
correctness path (every read, behind the memo) instead of in a deferred warm-up.

### 2. The deferral is a named output (`plan.ts`)

`planLedgerRows` → `planLedger`, returning `{ rows, deferred }`. A commit already in
`have` is *covered* and appears in neither. A commit with no conversation/attempt here
goes to `deferred`. `ReconcileResult` carries the count, so "12 deferred" is a state a
worktree fork reports rather than a silence. Rung 1 of the ladder: the two meanings that
used to share one return value now have different spellings, so a caller cannot confuse
them by accident.

### 3. The attribution generation (`push-ledger/attribution.ts`)

An in-process counter, bumped whenever a conversation row is actually inserted, folded
into the memo signature as `` `${tip}:${generation}` ``. It has to be free — the signature
is ungated and probed on every read — and it can be in-process because every write to
this database's `conversations` table comes from this backend (one instance per user, one
backend per DB fork). Over-counting costs one extra re-derivation; under-counting is the
bug, which is why the bump does not live at call sites.

### 4. The single insert funnel (`mutations/conversations.ts`)

`insertConversationRow(exec, values, { ignoreConflict })` is now THE conversation insert;
`insertConversation`, `insertConversationOnConflictDoNothing` and both arms of
`adoptOrphanConversation` route through it. A bump remembered at four call sites is a
bump forgotten at the fifth, and its failure mode is silent. The bump fires only when a
row came back, so a no-op conflict does not invalidate the memo.

## Rejected

- **Walk the whole history every time.** Deletes the bound entirely and is exactly
  correct — and today it costs only ~0.2 s of git CPU and ~720 KB of output. Rejected
  because that cost grows with the repo forever and sits on the read path in every
  backend; a correctness mechanism whose price tracks total history is one that gets
  removed later under load, which is how this class of bug returns.
- **A durable `deferred` table, re-attempted on each walk.** Exact *and* constant-cost,
  the theoretically best answer. Rejected on what it drags in: a table, a migration, and
  a retention sweep — and the sweep's TTL reintroduces the very same horizon, just
  longer. It buys a longer window at the price of a whole new store to keep correct.
- **Resolve deferrals eagerly: `git log --grep=<conversation id>` on every conversation
  insert.** Exact, and it puts a full-history git read on a mutation path — conversation
  creation would then fail, or block, on git. It also couples conversation creation to
  the ledger, which is the direction I5 spent a redesign getting away from.
- **Fold a DB-derived fingerprint (`count(*)` / `max(created_at)` over `conversations`)
  into the signature instead of a counter.** The signature is ungated and runs on every
  read; `count(*)` on that table is a seq scan. A cheap in-process counter is exact for
  the same reason the DB read would be — this backend is the only writer.

## What is still true after this

- **The 30-day horizon.** A commit whose conversation is adopted more than 30 days after
  it landed stays unrecorded. Stated policy, and the fix if it ever fires is to widen the
  constant, not to reach back to the watermark.
- **`--from-main` and hand-merged commits carry no conversation trailer**, so no layer can
  attribute them at all — unchanged by this, and unchangeable here. The
  `conversation-trailer` pre-push check keeps it the exception.

## Files changed

- `plugins/tasks/plugins/tasks-core/server/internal/push-ledger/walk-bound.ts` (+ test) — new
- `plugins/tasks/plugins/tasks-core/server/internal/push-ledger/attribution.ts` — new
- `plugins/tasks/plugins/tasks-core/server/internal/push-ledger/plan.ts` (+ test)
- `plugins/tasks/plugins/tasks-core/server/internal/push-ledger/reconcile.ts`
- `plugins/tasks/plugins/tasks-core/server/internal/push-ledger/freshness.ts`
- `plugins/tasks/plugins/tasks-core/server/internal/mutations/conversations.ts`
- `plugins/tasks/plugins/tasks-core/server/internal/mutations/cross-table.ts`
- Docs: `tasks-core/CLAUDE.md` § I5
