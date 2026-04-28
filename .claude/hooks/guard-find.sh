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

# Strip single- and double-quoted segments so `find` inside string literals
# (echo messages, rg/grep patterns, sed scripts) doesn't trigger the guard.
# Only unquoted `find` would actually invoke the binary. Imperfect for
# pathological cases like `$(find ...)` inside double quotes, but covers the
# common false-positive surface.
stripped=$(printf '%s' "$cmd" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")

# `find ` at start of a line or after a shell separator/operator.
# grep -E is used so ^ matches per-line (handles multiline commands correctly).
# Only matches after ;|&()` or line-start — NOT after plain spaces mid-line,
# which avoids false positives where "find" appears in prose or JS comments
# inside heredoc bodies. Skips false positives like findutils, findstr.
if ! printf '%s' "$stripped" | grep -qE '(^|[;|&()`])[[:space:]]*find[[:space:]]'; then
  exit 0
fi

# Allow when the traversal is explicitly bounded.
if [[ "$stripped" =~ -prune || "$stripped" =~ -maxdepth ]]; then
  exit 0
fi

deny "On this machine \`find\` is rerouted by Claude Code's shell shim to a bundled bfs that holds an unbounded directory FD frontier. Broad finds against trees with node_modules / worktrees accumulate ~65k DIR FDs and have crashed macOS. Prefer \`rg --files -g '<glob>'\` (or \`fd '<regex>'\`) — they are faster, respect .gitignore, and have bounded FDs. If you genuinely need find's predicates (-mtime/-size/-perm/etc.), scope with -prune (e.g. \`find . \\( -name node_modules -o -name .git -o -name .claude \\) -prune -o -name '*.ts' -print\`) or -maxdepth N. If you believe this block is a false positive and the call was legitimate as written, STOP your current task immediately, report the blocked command and the context to the user, and wait for further instructions — do not retry, do not work around it, do not improvise an alternative."
