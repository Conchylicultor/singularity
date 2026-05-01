#!/usr/bin/env bash
# PreToolUse guard: block Bash commands that write files to the main branch.
# Catches cp/mv/rsync/tee/redirections that bypass the Write/Edit guard.
# Bypass with $PWD/.allow-main (worktree-local, gitignored) — same token as
# guard-main-edits.sh, so one bypass covers both guards.
set -euo pipefail

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0
[ -f "$PWD/.allow-main" ] && exit 0

# Only meaningful inside a worktree (main worktree may legitimately write to $REPO).
[[ "$PWD" == */worktrees/* ]] || exit 0

# Repo root is three levels up from the worktree:
#   $PWD = $REPO/.claude/worktrees/<name>
REPO=$(cd "$PWD/../../.." && pwd)

# Quick bail: if the repo path doesn't appear in the command, no risk.
if ! echo "$cmd" | grep -qF "$REPO/"; then
  exit 0
fi

# Full parse via Python. Data is passed through env vars so that the heredoc
# can supply the script source without conflicting with stdin.
violation=$(GUARD_CMD="$cmd" GUARD_REPO="$REPO" GUARD_PWD="$PWD" python3 - <<'PYEOF'
import sys, re, os, shlex

cmd  = os.environ['GUARD_CMD']
repo = os.environ['GUARD_REPO']
pwd  = os.environ['GUARD_PWD']

def is_main_branch(p):
    """True when the path is under the repo root but NOT under the current worktree."""
    return p.startswith(repo + '/') and not p.startswith(pwd + '/')

def check_sub(sub):
    sub = sub.strip()
    if not sub:
        return None
    try:
        tokens = shlex.split(sub)
    except ValueError:
        tokens = sub.split()
    if not tokens:
        return None

    name = os.path.basename(tokens[0])

    # cp / mv: destination is the last non-flag argument (needs >= 2 paths)
    if name in ('cp', 'mv'):
        paths = [t for t in tokens[1:] if not t.startswith('-')]
        if len(paths) >= 2 and is_main_branch(paths[-1]):
            return f"{name} destination {paths[-1]!r}"

    # rsync: destination is the last non-flag argument
    elif name == 'rsync':
        paths = [t for t in tokens[1:] if not t.startswith('-')]
        if len(paths) >= 2 and is_main_branch(paths[-1]):
            return f"rsync destination {paths[-1]!r}"

    # tee: every argument is a destination
    elif name == 'tee':
        for t in tokens[1:]:
            if not t.startswith('-') and is_main_branch(t):
                return f"tee destination {t!r}"

    return None

# Check shell redirections (> or >>) anywhere in the command.
for m in re.finditer(r'>+\s*(\S+)', cmd):
    p = m.group(1)
    if is_main_branch(p):
        print(f"redirection target {p!r}")
        sys.exit(0)

# Check each shell subcommand (split on ;  &&  ||  |  &).
for sub in re.split(r'[;&|]+', cmd):
    result = check_sub(sub)
    if result:
        print(result)
        sys.exit(0)
PYEOF
)

if [ -n "$violation" ]; then
  deny "Blocked write to main branch: $violation is under $REPO (outside worktree $PWD).

Writing directly to the main branch from a worktree corrupts shared state — a previous agent ran \`cp <worktree>/file <main>/file\` and leaked uncommitted changes.

Write to files inside your worktree ($PWD) instead.

If you believe there is a legitimate reason to write outside the worktree: STOP immediately, report the blocked command and your reasoning to the user, and wait for instructions. Do NOT attempt to work around this guard (restructuring the command, using alternative tools, etc.). If the user explicitly approves, they will tell you to create \$PWD/.allow-main to bypass."
fi
