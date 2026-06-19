# Stale worktree DB-fork accumulation + slow-ops cluster fan-out

Date: 2026-06-19
Status: design → implementing

## Problem

`GET /api/slow-ops/cluster` scans every non-system Postgres DB on the host.
On this host that is **1245 databases**, of which ~1025 return
`relation "slow_ops" does not exist` — they are old-schema worktree forks
(created before the `slow_ops` migration) that are still on disk. Each scan
opens a short-lived pool against an already-contended cluster.

The premise "worktrees are long gone" turned out to be **false** — the dirs
physically exist. The real issue is that **finished worktrees never get reaped**.

## Investigation (live host data)

| Metric | Value |
|---|---|
| non-system DBs | 1245 |
| match `^att-\d+-[a-z0-9]+$` (fork DBs) | 1200 |
| fork DBs with a matching attempt row | 1196 |
| DB-only orphans (no attempt) | 4 |
| forks **older than 30 days** | **2** |
| forks 7–30 days old | 744 |
| forks within 7 days | 456 (~65/day) |
| forks whose attempt is **finished** (no live conversation) | **1179** |
| forks with a live conversation | 17 |
| git worktree dirs physically present | 1201 |

### Why they persist

The scheduled reaper (`worktree-cleanup.reap-stale`, hourly) collects via
`collectReapable`, which only reaps:

- **ORPHAN**: dir gone + DB present — almost none (dirs all exist).
- **STALE**: dir present + age ≥ **30 days** + `!active` — only **2** qualify.
- **DB-only orphan**: `att-*` DB, no attempt row, no dir — only 4.

So 1179 finished-but-recent worktrees are invisible to it. The log confirms it:
every hourly run prints `auto-reap: 0/3 reaped` — the only 3 targets it ever
finds are **malformed legacy rows** whose `worktreePath` points at the **main
repo** (`att-1777250203383-1u378r`, `attempt-system-batch`) or `/tmp`, and they
fail `git worktree remove` every single hour forever.

Two distinct defects:

1. **Policy too lenient.** 30-day floor + no git-hygiene means finished, fully
   pushed worktrees are retained for a month. The UI list already computes a
   tighter `isSafe` (clean + pushed + task done/dropped + ≥72h), but the
   scheduled reaper ignores it — the two policies have diverged.
2. **Safety bug.** The reaper calls `git worktree remove` on whatever
   `worktreePath` an attempt row carries, including the main repo path. Git
   refuses today, but the reaper should never even attempt to remove a path that
   is not a canonical `…/.claude/worktrees/<id>` worktree.

## Design

Two complementary, independent structural fixes.

### Fix A — slow-ops cluster fan-out scans only live forks

`handleSlowOpsCluster` (`plugins/debug/plugins/slow-ops/plugins/cluster/server/internal/handle-cluster.ts`)
replaces `listDatabases()` with a **relevant-DB set**:

- always include `singularity` (main),
- include a fork DB iff its attempt is `active` **or** was created within a
  recency window (24h) — keeps today's just-finished agent sessions visible.

Computed by intersecting `listAttempts()` (already public from tasks-core) with
`listDatabases()`. Drops 1245 → ~80 scans, and naturally excludes the old
pre-migration forks (recent forks are forked from current main, so they all have
`slow_ops`). Zero data-loss risk. New helper lives in the cluster plugin's
server internal; no new cross-plugin coupling beyond the existing public
barrels.

### Fix B — unify + tighten the reaper policy (root cause)

1. **Single source of truth for "safe to reap".** Extract the git-hygiene probe
   (`getGitHygiene`) and the `isSafe` predicate currently inlined in
   `handle-list.ts` into a shared internal module
   (`worktree-cleanup/server/internal/safety.ts`). `handle-list` (badge) and
   `collectReapable` (action) both consume it — the policies can no longer drift.

   `isSafe` = `(!dir && dbPresent)` **or**
   `(dir && unpushed===0 && !dirty && taskDeletable && age≥72h)`.

2. **Reaper reaps the `isSafe` set.** `collectReapable` now computes git hygiene
   for each candidate that still has a dir + fork DB (bounded concurrency), and
   reaps every `isSafe` attempt — not just 30-day-old ones. The **30-day hard
   floor** (`dir && age≥30d && !active`, regardless of hygiene) stays as the
   abandonment backstop for dirty/unpushed worktrees that never get cleaned up.
   Orphans and DB-only orphans are unchanged.

3. **Path-safety guard.** `reapAttempt` (reap.ts) skips `removeWorktree` unless
   the path is a canonical `<root>/.claude/worktrees/<id>` worktree (never the
   main root, never `/tmp`). For a malformed row it still drops the fork DB if
   the id is a valid fork name. This kills the hourly log spam and removes the
   "could remove main" hazard.

Effect: clean, finished, pushed worktrees are reaped at 72h instead of 30d.
Steady state drops from ~1200 to a few hundred (active + last-3-days + dirty).
The first post-deploy runs will reap hundreds at once (throttled, idempotent).

## Out of scope / follow-ups

- Malformed legacy attempt rows (`worktreePath` = main repo, `attempt-system-batch`,
  `tmp`) — the guard stops them being acted on, but the rows themselves remain.
  A separate data-migration/cleanup could remove them.
- Whether `database.fork` should skip forking for container/system attempts.
