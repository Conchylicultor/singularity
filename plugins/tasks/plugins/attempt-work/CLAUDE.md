# attempt-work

One authority for a single question: **where does this attempt stand relative to
`main`?** The answer is measured from git — how far the attempt's branch is ahead
of `main`, plus which of `main`'s commits carry this attempt's conversation
trailers — and it is the fact every "is it safe to drop this?" decision reads.

It lives under `plugins/tasks/` rather than inside `commits-graph` (a chip-and-pane
plugin) because the server-side exit-drop guard needs it and because the standing
is a task-domain fact. Dependency direction: `tasks-core` ← `attempt-work` ←
{`commits-graph`, `push-and-exit`, `drop-and-exit`}. `tasks-core` never imports it,
so there is no cycle.

## Why not the `pushes` table

The `pushes` table is an **event ledger**, written by the `tasks.push-ingest` job
reacting to `git.refAdvanced`. When that job lags — it has been observed 40+
minutes behind a wedged queue — the table is empty for work that is fully merged
into `main`. So `pushes.length === 0` conflated two different facts: *"nothing was
pushed"* and *"nothing has been ingested yet"*. Read as the former, it offered
**Drop & Close** over landed work, and `maybeDropTaskOnExit` actually performed the
drop.

Git has no such lag. Every commit that lands via `./singularity push` carries
`Singularity-Conversation: <convId>` and `Singularity-Push: <uuid>`, and the
pre-push `conversation-trailer` check *fails the push* when a commit lacks the
conversation trailer — so this is an enforced invariant, not a convention. `main`
is only ever fast-forwarded, so its history is a complete record of what landed.
Full design: `research/2026-08-17-global-attempt-work-git-derived-standing.md`.

## I3 — a ledger row is positive evidence only

`AttemptWork.ledgerPushes` is still read from `pushes`, and that is deliberate: a
row **proves** a push happened, which is what keeps a pre-trailer-era attempt (its
commits carry no trailer to grep for) from reading as droppable. But it may only
ever be **ORed into** a positive answer — see `standingOf` — and never used to
conclude a negative one. Its absence proves nothing at all.

Anything new that wants to know whether an attempt has work at stake reads
`getAttemptWork` / `attemptWorkResource`, not the ledger. What stays on the ledger
is everything that is *about one specific recorded push* (`task-events`,
`push-profiling`, the per-push diff, the review pane, the `pushes.landed` trigger)
— those are display-only or self-healing.

## I4 — the standing is a discriminated value, not a count

`standingOf(work)` returns `"none" | "pending" | "landed"`, and it is the **only**
place any of these counts is compared to zero. Decision sites `switch` on the
result, exhaustively, so a new arm becomes a `tsc` error rather than a silently
mishandled case. There is no array at a decision site whose emptiness can be
misread, and the destructive branch is reachable only from a measured `"none"`.

`"pending"` wins over `"landed"`: unpushed commits are the actionable state, so an
attempt with both still asks for a push.

## `no-branch` is an answer, not a failure

`AttemptPending` has two arms. `measured` carries `ahead` / `behind` /
`mergeBase` / `branch`. `no-branch` means the branch ref does not exist — and that
is a **determinate** answer: with no ref, no unpushed commit of this attempt can
survive to be lost, so `standingOf` may safely treat it as "nothing pending". It is
not a stand-in for a read that failed.

Everything that could make the standing merely *unknown* is kept out of that arm:

- A **reaped worktree** is not `no-branch`. `git worktree remove` does not delete
  the branch, so `refs/heads/claude-web/<attemptId>` (from
  `attemptBranchName`, the one definition of the convention) is still measurable
  from the main repo — and `landed` was always measurable there. This is why the
  resource does *not* collapse a missing worktree onto `unresolved`, the way
  `commits-graph` does.
- A **real git failure throws**. `refExists` distinguishes a clean "no such ref"
  (`rev-parse --verify --quiet` exiting 1) from every other non-zero exit, and
  `readMergeBase` / `readDeltaCounts` / `readLanded` propagate. A throw aborts the
  memo recompute and retains the previous entry; it never manufactures `ahead: 0`
  or an empty landed set.
- **Genuinely unmeasurable** is the payload's `Resolvable` unresolved arm — an
  attempt row that no longer exists. Consumers route that to the non-destructive
  action, exactly as they already do for an errored or never-loaded resource.

## Shape

- `core/protocol.ts` — the wire payload (`AttemptWork`, wrapped in `Resolvable`).
- `core/standing.ts` — `standingOf`, the decision layer.
- `core/trailers.ts` — the reader half of the trailer grammar (key names, the
  `git log --format=` fragment, `parseTrailerLog`), shared with the ledger's own
  ingest in `tasks/server/internal/push-watcher.ts` so the format string and its
  parse have one home. The writer half (the shell hook, the push CLI) keeps its
  literals, bound to these readers by the `conversation-trailer` check.
- `server/internal/measure.ts` — the git reads, deliberately **DB-free** so
  `measure.test.ts` can reproduce each behaviour against a throwaway repo with no
  database and no plugin runtime. `commits-graph` shares these helpers rather than
  keeping its own copies.
- `server/internal/work.ts` — the DB-fed orchestration behind one
  `createSignedMemo`, so the resource's `revalidate` and its `loader` are provably
  the same authority over the same inputs
  (`research/2026-07-09-global-etag-value-coproduction.md`). The signature folds in
  both tips, the conversation set (it grows while an attempt runs) and the ledger
  count (a push row can land with no local ref moving).
- `server/internal/resource.ts` — `attemptWorkResource`, `mode: "push"`, refreshed
  by `refHeadResource` alone. There is deliberately no `pushesResource`
  dependency: now that the landed set is git-measured, a ref advance is the
  complete refresh signal.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The attempt-work authority: where an attempt stands relative to `main`, measured from git (branch counts + Singularity-Conversation trailers on main) rather than from the lagging pushes ledger, as one live resource plus a direct read for the server-side exit-drop guard.
- Server:
  - Contributes: `resource.declare` "attempt-work"
  - Uses:
    - `infra/git-read-cache.createSignedMemo`
    - `infra/git-watcher.lastKnownMainSha`
    - `infra/git-watcher.refHeadResource`
    - `infra/host-read-pool.withHeavyReadSlot`
    - `infra/worktree.ensureMainWorktreeRoot`
    - `primitives/commit-list.GitError`
    - `primitives/commit-list.runGit`
    - `primitives/commit-list.tryRunGit`
    - `primitives/commit-list.WorktreeGoneError`
    - `tasks/tasks-core.getAttempt`
    - `tasks/tasks-core.listConversationIdsForAttempt`
    - `tasks/tasks-core.listPushesForAttempt`
  - Exports (values):
    - `attemptWorkEtag`
    - `attemptWorkServerResource`
    - `attemptWorkSignature`
    - `deltaEtag`
    - `evictAttemptWork`
    - `getAttemptWork`
    - `probeHeadMain`
    - `probeRefMain`
    - `readBranch`
    - `readDeltaCounts`
    - `readLanded`
    - `readLandedShas`
    - `readMergeBase`
    - `readPendingFromBranchRef`
    - `readPendingInWorktree`
    - `refExists`
  - Resources: `attempt-work` (push)
- Core:
  - Uses:
    - `primitives/live-state.resolvableSchema`
    - `primitives/live-state.resourceDescriptor`
    - `primitives/live-state.unresolved`
  - Exports (types):
    - `AttemptPending`
    - `AttemptWork`
    - `AttemptWorkPayload`
    - `Standing`
    - `TrailerCommit`
  - Exports (values):
    - `AttemptPendingSchema`
    - `AttemptWorkPayloadSchema`
    - `attemptWorkResource`
    - `AttemptWorkSchema`
    - `CONVERSATION_TRAILER_KEY`
    - `parseTrailerLog`
    - `PUSH_TRAILER_KEY`
    - `standingOf`
    - `TRAILER_LOG_FORMAT`
- Cross-plugin:
  - Imported by:
    - `conversations/conversation-view/commits-graph`
    - `conversations/conversation-view/drop-and-exit`

<!-- AUTOGENERATED:END -->
