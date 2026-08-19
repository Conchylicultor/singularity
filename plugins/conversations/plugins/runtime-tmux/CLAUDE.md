# runtime-tmux

Runs Claude CLI sessions inside tmux panes. The load-bearing part is not the
spawning — it is answering, once per poller tick, **which Claude session is this
pane running?** (`server/internal/claude-session.ts`).

## A pane's session is the one that claims it

The pane's process subtree is searched, but subtree membership is **not**
ownership. Claude Code runs **one** background daemon per machine, parented
under whichever pane happened to start it, and that daemon lends pre-warmed
spare processes to *any* conversation. So a completely unrelated agent's process
sits inside this pane's subtree:

```
9948   claude --resume …                    ← the pane (worktree A)
└─ 27243  claude daemon run                 ← the machine-wide daemon
   └─ 27538  claude bg-pty-host (spare)
      └─ 27571  claude bg-spare             ← lent to another conversation (worktree B)
```

The old rule kept the **freshest** sessions file in the subtree. The lent spare
writes hours after this pane's own idle file, so on 2026-08-19 it won — and a
conversation rendered another worktree's messages, resumed into another agent's
session, and pointed its Stop button at another agent's live transcript.

So a record must **claim** the pane, in two tiers, evaluated over the same walk:

| Tier | Predicate | Covers |
|---|---|---|
| 1 — identity (`self`) | the `tmux` stamp's trailing `%pane_id` equals this pane's | every CLI ≥ 2.1.233 |
| 2 — locality (`local`), only when tier 1 is empty | **no** `tmux` field, `kind !== "bg"`, and `cwd === pane.worktreePath` | legacy CLIs, and a relocated child that cannot stamp |

Everything else in the subtree belongs to somebody else. Freshness still orders
the candidates *within* the winning tier (an idle session can go weeks without a
write, so mtime never means "stale" — only "later than the other candidate"),
with ties going to the deepest pid.

Match on `%pane_id` only. `session_name` and `window_id` also appear in the
stamp, but both move (`rename-session`, `break-pane`, `move-window`); `pane_id`
is fixed for the pane's life. For the same reason `listPanes` asks tmux for
`#{pane_id}` and deliberately not `#{window_id}`.

### Why tier 2 must stay

Matching on the `tmux` stamp alone would resolve every live pane correctly today
and is much tighter — and it would be a regression. A daemon-hosted process does
not inherit `$TMUX_PANE`, so a **relocated** session cannot stamp itself; a
stamp-only rule stops following relocations and pins the pane to its launcher's
tombstone. That failure froze a transcript for 747 minutes in July 2026 and
again for 10h25m on 2026-08-18. A stranger's messages appearing is visible and
was caught within a day; a silently frozen transcript is not. **Never trade
visible-wrong for silent-empty here.**

For the same reason, deleting the subtree walk is not on the table: it is the
only channel that ever found a relocated session, the `ps` snapshot is already
taken once per tick, and it is what makes the `foreign-session-outranked`
evidence possible at all.

### Why tier 2 can exclude `kind: "bg"`

Background sessions stay reachable through the explicit `parkedJobId` → `jobId`
pointer (`followParkedJob`), which is authoritative and needs no guessing. That
pointer is what lets locality refuse every background host outright without
losing the parked case.

### Reading files, and what may throw

While *scanning* the subtree only the identity fields are parsed (`sessionId`,
`tmux`, `cwd`, `kind`, `parkedJobId`, `jobId`). `status` is validated against
`KNOWN_STATUSES` on the **adopted** record alone: parsing it everywhere meant
one background spare running a newer CLI with an unrecognised status threw and
blanked whichever pane happened to host the daemon.

- Unparseable `tmux` stamp → **throws**. The stamp is the whole basis of tier 1,
  so format drift must be loud on the first pane that hits it rather than
  silently demoting the fleet to tier 2.
- Unrecognised `kind` → reported, never thrown. `kind` only ever *excludes* a
  candidate, so a throw there is a self-inflicted blackout.
- Nothing claims the pane → `NULL_STATE`, never a throw. The poller then keeps
  the stored id, which is the recoverable state.

`findJobHost` filters job claimants to pids present in the `ps` snapshot
(`ProcessTree.pids`) and throws only on **two live** claimants of one job id.
Without the liveness filter a single leaked file from an exited host would be
indistinguishable from a real contradiction, and would wedge the pane at
`NULL_STATE` forever.

### The evidence trail

`SessionFileDeps.reportAnomaly` (defaulting to `recordReport`) is what keeps the
residual shapes investigable rather than merely invisible:

- `unclaimed-subtree-session` — the subtree named sessions and none claimed the
  pane. Emitted **only** when a session-bearing record was actually found; a
  subtree with no session file at all stays silent, because that is just Claude
  not having written its file yet.
- `foreign-session-outranked` — a rejected record was fresher than the winner,
  i.e. the old rule would have adopted a stranger here. A live counter of how
  often that happens.
- `cwd-mismatch` — the adopted record (after any park hop) runs elsewhere.
- `stale-job-host-file`, `unknown-session-kind` — as above.

Design: [`research/2026-08-19-global-pane-session-ownership.md`](../../../../research/2026-08-19-global-pane-session-ownership.md).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Runs Claude CLI sessions inside tmux panes.
- Server:
  - Uses:
    - `conversations.Runtime`
    - `conversations/model-provider.resolveCliFlag`
    - `infra/paths.CLAUDE`
    - `infra/paths.CLAUDE_SESSIONS_DIR`
    - `infra/paths.PS`
    - `infra/paths.TMUX`
    - `infra/worktree.isWorktreeOpActive`
    - `packages/spawn-priority.backgroundPrefix`
    - `reports.DEFAULT_REPORT_DEBOUNCE_MS`
    - `reports.recordReport`
    - `reports.recordReportDebounced`
  - Exports (types):
    - `PaneRef`
    - `ProcessLister`
    - `ProcessTree`
    - `TmuxPane`
  - Exports (values):
    - `captureProcessTree`
    - `listPanes`
    - `subtreePids`
- Cross-plugin:
  - Imported by: `debug/session-divergence`

<!-- AUTOGENERATED:END -->
