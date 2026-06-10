---
name: debug
description: >
  Map of the debugging surfaces (logs, profiling, crashes, DB, queue, ...)
  available to find a bug in Singularity. Read BEFORE debugging anything.
---

# Debugging Surfaces

High-level map of where to look. Open the linked `CLAUDE.md` for details.

## Logs
Browser + server log lines persisted per worktree to `~/.singularity/worktrees/<wt>/logs/<channel>.jsonl` (survives restarts). Emit from browser via `clientLog(channel, line)`; `tail`/`cat` the file to read.
→ [`plugins/debug/plugins/logs/CLAUDE.md`](../../../plugins/debug/plugins/logs/CLAUDE.md)

## Profiling (Gantt)
Build steps, server boot phases, push contention, runtime HTTP/DB/loader, and stats timings. Use to find *slow*, not just *broken*.
→ [`plugins/debug/plugins/profiling/CLAUDE.md`](../../../plugins/debug/plugins/profiling/CLAUDE.md)

## Crashes
Uncaught browser/server errors recorded + deduped into tasks; handled 4xx/5xx and mutation errors also file crash tasks. The Debug pane lists all crashes (including noise).
→ core [`plugins/crashes/CLAUDE.md`](../../../plugins/crashes/CLAUDE.md) · pane [`plugins/debug/plugins/crashes/CLAUDE.md`](../../../plugins/debug/plugins/crashes/CLAUDE.md)

## Query the DB
`query_db` MCP tool — read-only SQL against the worktree DB (pass `database` for another worktree or `"singularity"` for main). Mutations rejected.
→ [`plugins/database/plugins/query/CLAUDE.md`](../../../plugins/database/plugins/query/CLAUDE.md)

## Jobs / Events / Triggers
Queue debug pane — inspect the jobs queue, events emission log, and active triggers.
→ [`plugins/debug/plugins/queue/CLAUDE.md`](../../../plugins/debug/plugins/queue/CLAUDE.md)

## Claude CLI calls
Every single-shot `claude --print` (Haiku/Sonnet/Opus) with prompt, output, source, duration.
→ [`plugins/debug/plugins/claude-cli-calls/CLAUDE.md`](../../../plugins/debug/plugins/claude-cli-calls/CLAUDE.md)

## Other debug panes
Memory browser, broadcasts editor, worktree cleanup — under [`plugins/debug/plugins/`](../../../plugins/debug).

## Verify behavior in the real app
Scripted Playwright helper — clicks, before/after screenshots, reports control state. Prefer this over blind static screenshots.
→ [`e2e/screenshot.mjs`](../../../e2e/screenshot.mjs)

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.
