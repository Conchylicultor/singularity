#!/usr/bin/env bash
# PreToolUse guard: block direct deletion of migration files.
# Migration SQL files and snapshots must only be managed by `./singularity build`,
# never deleted by hand. Manual deletion breaks the snapshot chain and leaves the
# DB schema in an inconsistent state.
# Bypass with $PWD/.allow-migrations (worktree-local, gitignored).
set -euo pipefail

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

if [ -f "$PWD/.allow-migrations" ]; then
  exit 0
fi

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Strip quoted strings and shell comments to avoid false positives.
stripped=$(printf '%s' "$cmd" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g; s/(^|[[:space:]])#.*//g")

# Only intercept rm commands that target a path inside db/migrations/.
if ! printf '%s' "$stripped" | grep -qE '(^|[;|&()`$])[[:space:]]*rm[[:space:]]'; then
  exit 0
fi
if ! printf '%s' "$stripped" | grep -q 'db/migrations/'; then
  exit 0
fi

deny "Refusing to delete migration files directly. Migration SQL files and snapshots are managed exclusively by \`./singularity build\` — never by hand.

To remove a table or plugin that has a DB migration:
  1. Remove the table(s) from the plugin's schema.ts.
  2. Run: ./singularity build --migration-name remove_<plugin_name>
     Drizzle will generate a DROP TABLE migration automatically and keep the snapshot chain intact.

If you hit a snapshot-chain Y-fork after rebasing onto main, run:
  ./singularity build --reset-migration --migration-name <slug>
That drops this branch's migration files (anything absent from origin/main) and regenerates them against the new tip — no manual deletion needed.

Deleting migration files manually breaks the snapshot chain for every downstream agent and leaves the DB schema in an inconsistent state (as happened with the yak-shaving removal). If you believe this is a legitimate exception: STOP immediately, report the blocked command and your reasoning to the user, and wait for instructions. NEVER attempt to bypass this guard on your own — not by restructuring the command, not by using alternative tools, not by any other means."
