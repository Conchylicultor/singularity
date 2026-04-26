#!/bin/zsh
# FD / process snapshot for Singularity crash investigation.
#
# Tick (default 30s): writes a single timestamped block to
#   ~/.singularity/logs/fd-monitor.log
#
# When something looks like a leak in progress, this tick *also* writes a
# forensic dump to ~/.singularity/logs/fd-monitor-incidents/<ts>/. Two triggers:
#
#   1. Per-pid: any single pid holds more than $SUSPECT_PID_FDS open files.
#      (Default 3000 — claude CLI normally peaks ~600; the leaker hit 65k.)
#   2. System-wide: kern.num_files crosses $SYSTEM_NUM_FILES_PCT of kern.maxfiles.
#      (Default 25% — system normally idles at ~3-5%; the crash spike hit ~80%.)
#
# Forensic dump per suspect pid:
#   - <ts>-pid<pid>.txt:    ps line, lsof type breakdown, top FD names
#   - <ts>-pid<pid>.lsof.gz: gzipped full lsof output for that pid
# Plus once per incident:
#   - <ts>-system.txt:      kernel state, top 50 cmd:pid, top 20 cmd groups
#   - <ts>-system.lsof.gz:  gzipped full system-wide lsof
#
# Why dump *during* the tick: the leaker often dies between ticks (hits
# kern.maxfilesperproc and gets killed, or the box crashes). The lsof we
# already captured this tick is our only chance to see what it had open.

LOG="$HOME/.singularity/logs/fd-monitor.log"
INCIDENTS="$HOME/.singularity/logs/fd-monitor-incidents"
MAX_LINES=200000  # rough rotation threshold for the main log

SUSPECT_PID_FDS=${SUSPECT_PID_FDS:-3000}
SYSTEM_NUM_FILES_PCT=${SYSTEM_NUM_FILES_PCT:-25}

mkdir -p "$(dirname "$LOG")" "$INCIDENTS"

# --- Capture system state once -------------------------------------------------

NUM_FILES=$(sysctl -n kern.num_files 2>/dev/null || echo 0)
MAX_FILES=$(sysctl -n kern.maxfiles 2>/dev/null || echo 1)
NUM_FILES_PCT=$(( NUM_FILES * 100 / MAX_FILES ))

LSOF_TMP=$(mktemp -t fd-monitor-lsof)
lsof -n -P 2>/dev/null > "$LSOF_TMP"
LSOF_TOTAL=$(wc -l < "$LSOF_TMP" | tr -d ' ')

# top holders: "<count> <cmd>:<pid>" sorted desc
HOLDERS=$(awk 'NR>1 {print $1":"$2}' "$LSOF_TMP" | sort | uniq -c | sort -rn)

# --- Tick block to main log ----------------------------------------------------

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
  sysctl kern.num_files kern.maxfiles kern.maxproc kern.maxfilesperproc 2>/dev/null
  echo "ps_count=$(ps -A | wc -l | tr -d ' ')"
  echo "lsof_total=$LSOF_TOTAL"
  echo "num_files_pct=$NUM_FILES_PCT"

  echo "--- top 20 FD holders (count cmd:pid) ---"
  printf '%s\n' "$HOLDERS" | head -20

  echo "--- top 10 FD-holding command groups ---"
  awk 'NR>1 {print $1}' "$LSOF_TMP" | sort | uniq -c | sort -rn | head -10

  echo "--- singularity quick stats ---"
  GATEWAY_PID=$(pgrep -x gateway 2>/dev/null)
  echo "gateway_pid=${GATEWAY_PID:-none}"
  if [ -n "$GATEWAY_PID" ]; then
    echo "gateway_fds=$(awk -v p="$GATEWAY_PID" '$2==p' "$LSOF_TMP" | wc -l | tr -d ' ')"
  fi
  echo "bun_backends=$(pgrep -f 'bun src/index.ts' 2>/dev/null | wc -l | tr -d ' ')"
  echo "tmux_sessions=$(/opt/homebrew/bin/tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')"
  echo "claude_cli_procs=$(pgrep -af '/claude($| )' 2>/dev/null | wc -l | tr -d ' ')"
  echo "postgres_backends=$(ps -axo user,command 2>/dev/null | grep -E '^admin +postgres:' | wc -l | tr -d ' ')"
  echo "worktree_jsons=$(ls "$HOME/.singularity/worktrees/"*.json 2>/dev/null | wc -l | tr -d ' ')"
  echo
} >> "$LOG" 2>&1

# --- Incident detection --------------------------------------------------------

# Suspect pids: any holder above the per-pid threshold.
SUSPECT_PIDS=$(printf '%s\n' "$HOLDERS" | awk -v t="$SUSPECT_PID_FDS" '
  $1+0 > t+0 {
    n = split($2, a, ":");
    print a[n];   # last segment is pid (cmd may contain colons)
  }')

SYSTEM_INCIDENT=0
[ "$NUM_FILES_PCT" -ge "$SYSTEM_NUM_FILES_PCT" ] && SYSTEM_INCIDENT=1

if [ -n "$SUSPECT_PIDS" ] || [ "$SYSTEM_INCIDENT" = 1 ]; then
  TS=$(date '+%Y%m%d-%H%M%S')
  DIR="$INCIDENTS/$TS"
  mkdir -p "$DIR"

  # Annotate the main log so it's easy to grep.
  SUSPECT_PIDS_INLINE=$(printf '%s' "$SUSPECT_PIDS" | tr '\n' ' ' | sed 's/ *$//')
  {
    echo "!!!!! INCIDENT $TS  num_files_pct=$NUM_FILES_PCT  suspect_pids=${SUSPECT_PIDS_INLINE:-none}"
    echo "!!!!! see: $DIR/"
  } >> "$LOG"

  # System-wide forensic snapshot.
  {
    echo "===== INCIDENT $TS — system snapshot ====="
    sysctl kern.num_files kern.maxfiles kern.maxproc kern.maxfilesperproc 2>/dev/null
    echo "lsof_total=$LSOF_TOTAL"
    echo "num_files_pct=$NUM_FILES_PCT  threshold=$SYSTEM_NUM_FILES_PCT"
    echo
    echo "--- top 50 FD holders (count cmd:pid) ---"
    printf '%s\n' "$HOLDERS" | head -50
    echo
    echo "--- top 20 FD-holding command groups ---"
    awk 'NR>1 {print $1}' "$LSOF_TMP" | sort | uniq -c | sort -rn | head -20
    echo
    echo "--- ps -A (full) ---"
    ps -axww -o pid,ppid,user,etime,rss,command 2>/dev/null
  } > "$DIR/system.txt"
  gzip -c "$LSOF_TMP" > "$DIR/system.lsof.gz"

  # Per-pid forensic snapshot.
  for pid in ${=SUSPECT_PIDS}; do
    {
      echo "===== INCIDENT $TS — pid=$pid ====="
      echo "--- ps -ww ---"
      ps -ww -p "$pid" -o pid,ppid,user,etime,rss,vsz,command 2>/dev/null
      echo
      echo "--- lsof type breakdown ---"
      awk -v p="$pid" '$2==p {print $5}' "$LSOF_TMP" | sort | uniq -c | sort -rn
      echo
      echo "--- lsof FD-kind (column 4) breakdown ---"
      awk -v p="$pid" '$2==p {print $4}' "$LSOF_TMP" | sort | uniq -c | sort -rn | head -30
      echo
      echo "--- top 30 FD names ---"
      awk -v p="$pid" '$2==p {print $NF}' "$LSOF_TMP" | sort | uniq -c | sort -rn | head -30
      echo
      echo "--- sample 30 lines of full lsof for this pid ---"
      awk -v p="$pid" '$2==p' "$LSOF_TMP" | head -30
    } > "$DIR/pid$pid.txt"
    awk -v p="$pid" '$2==p' "$LSOF_TMP" | gzip > "$DIR/pid$pid.lsof.gz"
  done
fi

rm -f "$LSOF_TMP"

# --- Lazy rotation of main log -------------------------------------------------

if [ -f "$LOG" ]; then
  LINES=$(wc -l < "$LOG" 2>/dev/null | tr -d ' ')
  if [ "${LINES:-0}" -gt "$MAX_LINES" ]; then
    mv "$LOG" "$LOG.1"
  fi
fi

# Best-effort cleanup of incident dirs older than 14 days.
find "$INCIDENTS" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null
