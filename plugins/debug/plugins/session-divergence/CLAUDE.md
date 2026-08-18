# session-divergence

Watches for a conversation whose agent is **talking in a session the UI cannot see**.

A conversation's turns are assembled from the transcripts of the Claude session ids
recorded in its chain (`conversation_sessions`, owned by `conversations/session-chain`).
The poller appends to that chain whatever `runtime-tmux`'s `resolveSessionState` says
is live for the pane. In July 2026 that resolution read `pane_pid`'s sessions file
alone, so when Claude Code relocated a live session into a daemon-hosted descendant,
the pane stayed pinned to the launcher's tombstone id: the agent ran fine and wrote
turns for **12 hours** into a transcript nothing ever read. Nobody noticed, because a
conversation that is silently missing turns looks exactly like a conversation that is
idle. See `research/2026-07-09-conversations-session-chain.md`.

The fix (subtree-wide, freshest-mtime resolution) closed the shape we saw. It cannot
close the shape we haven't. **The trigger was never reproducible on demand** — it fired
once, on 1 of 23 panes, correlating with a Claude CLI self-update — so this monitor is
the only mechanism by which we learn whether the fix holds, or whether a future,
deeper handoff shape defeats it. Silence here is the signal.

On 2026-08-18 a second shape did defeat it — and this monitor stayed silent through the
whole 10-hour outage, which is the more important half of the story. Claude Code
*parked* a pane's session as a background job: it forked the conversation to a new
session id, handed it to a `--bg-pty-host` process that launchd re-parented, and left a
stub in the pane. The live session was **outside the pane's subtree entirely**, so the
subtree walk found one id, matched it against the chain, and agreed with the resolver it
exists to audit. Both now follow the pointer that links the two — the stub's
`parkedJobId` to the host's `jobId` — and both do so independently. See the 2026-08-18
addendum in the research doc.

## The predicate

A per-worktree scheduled job (`debug.session-divergence-monitor`, every 5 min) takes
ONE process-table snapshot and, for each active conversation that still owns a live
tmux pane, flags a session id `s` **reachable from** that pane when all of:

- **(a)** `s` is absent from the conversation's recorded chain — no turn of `s` can
  ever render;
- **(b)** `s` has a transcript file on disk — the agent really is talking there,
  rather than `s` being a launcher tombstone that never ran a turn;
- **(c)** `s`'s transcript mtime leads the chain **tail's** transcript mtime by more
  than `graceMinutes` — the conversation has actually moved there.

`(c)` is what keeps the monitor quiet in the ordinary fork: a freshly-spawned session
writes its transcript a moment before the 1s poller appends it to the chain, so for
that instant it trivially satisfies (a) and (b). It trips only once the lead outlives
the grace window — i.e. the poller had minutes of ticks and still never recorded it.
A conversation whose chain is empty, or whose tail has no transcript yet, is skipped:
there is no baseline to measure a lead against.

**Reachable** means: named by a sessions file in the pane's process subtree, or — following
`parkedJobId` → `jobId` transitively — by a file claiming a background job one of those points
at. Reachability is the half that decides what the predicate can even see, so it is the half a
new detachment shape breaks first; `reachableSessionIds` is pure and unit-tested for that reason.

## Why it does not reuse `resolveSessionState`

The monitor shares `captureProcessTree` / `subtreePids` with `runtime-tmux` (exported
from its barrel for exactly this) so subtree membership can never differ from the
resolution it audits. But it reads the `~/.claude/sessions/<pid>.json` files itself
rather than calling `resolveSessionState`, because **that resolver is what is on
trial**: if it picks the wrong id, a detector built on it agrees with it and stays
silent. The process walk is shared; the session evidence is independent.

The parked-job hop is duplicated here for the same reason, deliberately: sharing the
resolver's implementation of it would mean one bug blinds both. What is shared is the
*shape of the world* (the process tree); what is duplicated is every judgement about it.

## Layout

- `core/config.ts` — `enabled` + `graceMinutes` (runtime-editable in Settings → Config).
- `core/kinds.ts` — the report payload: the conversation, both session ids, both mtimes.
- `server/internal/detect.ts` — the predicate, with its filesystem/DB reads behind an
  injectable `DetectDeps` so it is unit-testable (`detect.test.ts`); plus the pure
  `reachableSessionIds` (subtree ids + parked-job hops) its IO shell wraps.
- `server/internal/monitor-job.ts` — the scheduled job: read config, run the predicate,
  file a report per divergence. `perWorktree: true` because the chain rows it audits
  live in each worktree's own DB fork (same reason `queue-health` samples its own queue).
- `server/internal/divergence-kind.ts` — the report kind, deduped one row per
  conversation, `warning` variant with a 6h notification re-arm.
- `web/` — the one-line Debug → Reports summary and the config registration.

> The config `name` `session-divergence`, the job name
> `debug.session-divergence-monitor`, and the report kind
> `conversation-session-divergence` are load-bearing explicit literals — persisted
> config and report dedup depend on them; do not rename.

## Testing

```bash
bun test plugins/debug/plugins/session-divergence
```

To exercise it end-to-end, force a synthetic divergence by inserting an older tail into
`conversation_sessions` for a live conversation, wait one cron tick, and confirm exactly
one `conversation-session-divergence` report — and zero rows for the healthy panes.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Session-divergence report renderer: a one-line Debug → Reports summary for the conversation-session-divergence kind, plus the enabled/grace config registration. Session-divergence monitor: a per-worktree scheduled job that takes one process-table snapshot (sharing runtime-tmux's own captureProcessTree), reads every Claude session id reachable from each live conversation pane — its process subtree plus the parked-background-job pointers out of it — and files one deduped conversation-session-divergence report per conversation whose live session is absent from the recorded session chain while its transcript leads the chain tail's by more than the grace window — i.e. the agent is talking where the UI cannot see.
- Web:
  - Contributes:
    - `ConfigV2.WebRegister`
    - `Reports.KindView` → `SessionDivergenceSummary`
  - Uses:
    - `config_v2.ConfigV2`
    - `primitives/css/badge.Badge`
    - `primitives/css/inline.Inline`
    - `reports.Reports`
- Server:
  - Contributes:
    - `ConfigV2.Register` "session-divergence"
    - `report-kind` "conversation-session-divergence"
  - Uses:
    - `config_v2.ConfigV2`
    - `config_v2.getConfig`
    - `conversations/runtime-tmux.captureProcessTree`
    - `conversations/runtime-tmux.listPanes`
    - `conversations/runtime-tmux.ProcessTree`
    - `conversations/runtime-tmux.subtreePids`
    - `conversations/session-chain.listSessionChain`
    - `conversations/transcript-watcher.findTranscriptPath`
    - `infra/jobs.defineJob`
    - `infra/paths.CLAUDE_SESSIONS_DIR`
    - `reports.recordReport`
    - `reports.ReportKind`
    - `tasks/tasks-core.listActiveConversations`
  - Register: `defineJob('debug.session-divergence-monitor')`
- Core:
  - Uses:
    - `config_v2.defineConfig`
    - `fields/bool/config.boolField`
    - `fields/int/config.intField`
  - Exports (types): `SessionDivergencePayload`
  - Exports (values):
    - `sessionDivergenceConfig`
    - `SessionDivergencePayloadSchema`

<!-- AUTOGENERATED:END -->
