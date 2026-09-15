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

## Is this pane working, or waiting on the user?

`server/internal/pane-status.ts` — pure, unit-tested, and deliberately separate
from the tmux plumbing, because the precedence rule between its two inputs is
the whole correctness story.

**The session file is the authority. The pane title may only ever promote to
`working`, never demote to `waiting`.**

| Signal | What it says | Weight |
|---|---|---|
| `~/.claude/sessions/<pid>.json` `status` | `busy` / `idle` / `shell` / `waiting`, written by the CLI on every transition | decides |
| pane title prefix | a spinner frame → working; anything else → no opinion | may promote only |
| our own `isWorktreeOpActive(worktree)` | a build or push is genuinely in flight here | disambiguates `shell` |

The direction is load-bearing. The title is a rendering decision the CLI is free
to change, and it has changed twice: v2.1.228 swapped the braille spinner frames
for half-circles, and **v2.1.236 stopped animating the title altogether** — a
busy agent now renders the same `✳` ready mark it renders when idle. Under the
old title-first rule (`36e4721c3`, May 2026) that reported every agent on the new
CLI as `Waiting` while it worked — silently, fleet-wide, while the session file
said `busy` throughout. A demoting title turns a cosmetic CLI change into a
status blackout; a promote-only title can at worst lose a hint the file carries
anyway.

The title is still read for the *display* title, and the spinner still promotes,
which covers the one-write lag at a turn boundary. Only when there is **no**
session record at all (startup race, or a CLI too old to write one) does the
title decide in both directions.

### `shell` is the ambiguous one

The CLI writes `status: "shell"` when a background task is attached **and** the
agent is sitting at the `❯` prompt — identical whether that task is a build that
will finish and resume it, or a never-ending one (`bun dev`, `tail -f`, a poll
loop whose marker never matched) it will wait on forever. Pinning `shell` to
working stuck a conversation at `working` permanently; letting it read as waiting
put a live build in the needs-input queue. Only Singularity can tell the two
apart, via its own per-worktree op marker — so `shell` means working **only**
while `isWorktreeOpActive` is true. Design:
[`research/2026-06-03-global-fix-shell-status-stuck-working.md`](../../../../research/2026-06-03-global-fix-shell-status-stuck-working.md).

Mid-turn is always `busy`, background tasks or not (verified on 2.1.237), so this
branch only ever concerns an agent already back at its prompt.

## The pane starts from an allowlisted environment

There is one tmux server per machine, it keeps the environment of whichever
process first talked to its socket (in practice the main backend), and every
`tmux new-session` forks from it — so a pane inherits that backend's namespace,
socket path and cwd. `-e` only ADDS, so the two variables we deliver that way
sat on top of the leak rather than replacing it. tmux therefore execs

```
zsh -l -c <wrapper> zsh <claudeCmd> [prompt]
```

with the wrapper (`server/internal/agent-session-env.ts`)

```
cmd="$1"; shift; exec env -i HOME="$HOME" … PATH=/usr/bin:/bin:/usr/sbin:/sbin zsh -l -c "$cmd" zsh "$@"
```

The outer shell exists only to expand `$NAME` — it is the one process that can
still see tmux's injected `TMUX` / `TMUX_PANE` and the `-e` values. The inner
login shell starts from exactly the allowlist and rebuilds `PATH` from the
user's profile; the seed is there only so early rc lines that shell out work.

Allowlist, not `tmux set-environment -g -u` per bad name: what a backend's
environment may carry is an open set, so naming them only ever catches the last
leak found.

**`TMUX_PANE` must stay in the list.** Tier-1 ownership above is keyed on it,
and the CLI can only stamp what it inherits; drop it and every pane silently
falls back to tier-2 locality.

**`CLAUDE_CODE_DISABLE_AGENT_VIEW` must stay in the list too.** It is the third
`-e` value, and it is what keeps a session in its pane instead of Claude Code's
background daemon; an allowlist that dropped it would silently re-open the
Sep 9 misattribution.

Nothing is interpolated into the wrapper: the command rides in as `$1` and the
prompt as `$2`, so `--settings '{"ultracode":true}'` crosses two shells without
escaping. After the `shift`, `"$@"` is the prompt or nothing — which is what
keeps a short prompt arriving as the inner shell's `$1`, the contract the
`-- "$1"` in the command string depends on.

The launch message gets one space before a leading `/` (`launch-message.ts`):
the CLI runs an opening `/word` as a slash command, so a description starting
"/todo blocks…" never reached the model. `send()` is not escaped — a later turn
may be a real command (`/compact`).

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
