#!/usr/bin/env bash
# PreToolUse guard: restrict Write/Edit to an allowlist of locations.
# Allowed: $PWD (worktree), ~/.claude/projects/*/memory/, /tmp.
# Plans directory redirects to the plan skill.
# Bypass everything with $PWD/.allow-main (worktree-local, gitignored).
set -euo pipefail

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

f=$(jq -r '.tool_input.file_path // empty')
[ -z "$f" ] && exit 0
case "$f" in /*) ;; *) f="$PWD/$f" ;; esac

if [ -f "$PWD/.allow-main" ]; then
  exit 0
fi

# Allowlist
case "$f" in
  "$PWD"/*|"$PWD") exit 0 ;;
  "$HOME"/.claude/projects/*/memory/*) exit 0 ;;
  /tmp/*) exit 0 ;;
esac

# Plans: redirect to skill
case "$f" in
  "$HOME"/.claude/plans/*)
    deny "Do not edit plan files directly ($f). Use the \`plan\` skill instead — it writes the plan doc to the correct location."
    ;;
esac

deny "Refusing to edit $f — this path is not in the allowlist (worktree $PWD, ~/.claude/projects/*/memory/, /tmp). Edit files inside your worktree (including the project .claude/ !). If — and only if — the user has EXPLICITLY instructed you in this conversation to edit outside these locations, create $PWD/.allow-main to bypass (gitignored, worktree-local). Do NOT create that file on your own initiative. Do NOT assume you have permission just based on the user task. Permission has to be EXPLICIT."
