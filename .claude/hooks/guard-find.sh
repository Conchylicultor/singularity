#!/usr/bin/env bash
# PreToolUse guard: refuse `find` calls that don't bound their FD usage.
# Claude Code's shell shim re-execs `find` as a bundled bfs that holds an
# unbounded directory FD frontier — broad finds against this repo accumulate
# ~65k DIR FDs and have crashed macOS. See ~/.singularity/logs/fd-monitor-incidents/.
set -euo pipefail

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# `find ` at start of command or after a shell separator/operator.
# Skips false positives like findutils, findstr.
if ! [[ "$cmd" =~ (^|[^a-zA-Z0-9_-])find[[:space:]] ]]; then
  exit 0
fi

# Allow when the traversal is explicitly bounded.
if [[ "$cmd" =~ -prune || "$cmd" =~ -maxdepth ]]; then
  exit 0
fi

deny "On this machine \`find\` is rerouted by Claude Code's shell shim to a bundled bfs that holds an unbounded directory FD frontier. Broad finds against trees with node_modules / worktrees accumulate ~65k DIR FDs and have crashed macOS. Prefer \`rg --files -g '<glob>'\` (or \`fd '<regex>'\`) — they are faster, respect .gitignore, and have bounded FDs. If you genuinely need find's predicates (-mtime/-size/-perm/etc.), scope with -prune (e.g. \`find . \\( -name node_modules -o -name .git -o -name .claude \\) -prune -o -name '*.ts' -print\`) or -maxdepth N. If you believe this block is a false positive and the call was legitimate as written, STOP your current task immediately, report the blocked command and the context to the user, and wait for further instructions — do not retry, do not work around it, do not improvise an alternative."
