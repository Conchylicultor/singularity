#!/bin/zsh
# FD / process snapshot for Singularity crash investigation.
#
# Appends a single timestamped block to ~/.singularity/logs/fd-monitor.log.
# Designed to be run on a short interval (~30s) by a launchd agent.
#
# What we capture:
#   - Kernel FD/proc-table state (kern.num_files, kern.maxfiles, kern.maxproc, ...)
#   - Process count (proc-table pressure)
#   - Total open FDs (system-wide, per `lsof`)
#   - Top 20 FD holders by (cmd, pid)
#   - Top 10 FD-holding command groups (e.g. "bun" overall vs split by pid)
#   - Singularity-specific counters: gateway FDs, bun backends, tmux sessions,
#     claude CLI procs, postgres backends, registered worktree JSONs
#
# Goal: when the Mac next hits "too many files open", grep the log for the
# minute before the crash to identify which process family was burning FDs.

LOG="$HOME/.singularity/logs/fd-monitor.log"
MAX_LINES=200000  # rough rotation threshold

mkdir -p "$(dirname "$LOG")"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
  sysctl kern.num_files kern.maxfiles kern.maxproc kern.maxfilesperproc 2>/dev/null
  echo "ps_count=$(ps -A | wc -l | tr -d ' ')"

  LSOF_OUT=$(lsof -n -P 2>/dev/null)
  echo "lsof_total=$(printf '%s\n' "$LSOF_OUT" | wc -l | tr -d ' ')"

  echo "--- top 20 FD holders (count cmd:pid) ---"
  printf '%s\n' "$LSOF_OUT" | awk 'NR>1 {print $1":"$2}' | sort | uniq -c | sort -rn | head -20

  echo "--- top 10 FD-holding command groups ---"
  printf '%s\n' "$LSOF_OUT" | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn | head -10

  echo "--- singularity quick stats ---"
  GATEWAY_PID=$(pgrep -x gateway 2>/dev/null)
  echo "gateway_pid=${GATEWAY_PID:-none}"
  if [ -n "$GATEWAY_PID" ]; then
    echo "gateway_fds=$(lsof -p "$GATEWAY_PID" 2>/dev/null | wc -l | tr -d ' ')"
  fi
  echo "bun_backends=$(pgrep -f 'bun src/index.ts' 2>/dev/null | wc -l | tr -d ' ')"
  echo "tmux_sessions=$(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')"
  echo "claude_cli_procs=$(pgrep -af '/claude($| )' 2>/dev/null | wc -l | tr -d ' ')"
  echo "postgres_backends=$(ps -axo user,command 2>/dev/null | grep -E '^admin +postgres:' | wc -l | tr -d ' ')"
  echo "worktree_jsons=$(ls "$HOME/.singularity/worktrees/"*.json 2>/dev/null | wc -l | tr -d ' ')"
  echo
} >> "$LOG" 2>&1

# Lazy rotation: if the log grew past MAX_LINES, move it aside.
if [ -f "$LOG" ]; then
  LINES=$(wc -l < "$LOG" 2>/dev/null | tr -d ' ')
  if [ "${LINES:-0}" -gt "$MAX_LINES" ]; then
    mv "$LOG" "$LOG.1"
  fi
fi
