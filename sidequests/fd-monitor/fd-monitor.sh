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
#   - <ts>/pid<pid>.txt:    ps line, lsof type breakdown, top FD names
#   - <ts>/pid<pid>.lsof.gz: gzipped full lsof output for that pid
# Plus once per incident:
#   - <ts>/system.txt:      kernel state, top 50 cmd:pid, top 20 cmd groups
#   - <ts>/system.lsof.gz:  gzipped full system-wide lsof
#
# Why dump *during* the tick: the leaker often dies between ticks (hits
# kern.maxfilesperproc and gets killed, or the box crashes). The lsof we
# already captured this tick is our only chance to see what it had open.
#
# Self-protection: lockfile prevents overlap if a tick takes longer than the
# launchd interval (lsof can hang under FD pressure). System-wide and per-pid
# dumps are throttled by cooldowns so a sustained elevation doesn't spam the
# disk. lsof is sanity-checked before incident detection runs, so we don't
# write garbage forensics if lsof itself failed mid-run.

LOG="$HOME/.singularity/logs/fd-monitor.log"
INCIDENTS="$HOME/.singularity/logs/fd-monitor-incidents"
MAX_LINES=200000  # rough rotation threshold for the main log

SUSPECT_PID_FDS=${SUSPECT_PID_FDS:-3000}
SYSTEM_NUM_FILES_PCT=${SYSTEM_NUM_FILES_PCT:-25}
SYSTEM_COOLDOWN=${SYSTEM_COOLDOWN:-300}        # 5 min between system-wide dumps
PID_COOLDOWN=${PID_COOLDOWN:-300}              # 5 min between dumps for the same pid
MIN_LSOF_LINES=${MIN_LSOF_LINES:-500}          # treat lsof as failed if shorter
MAX_INCIDENT_DIRS=${MAX_INCIDENT_DIRS:-200}    # hard cap on retained incident dirs
LOCK_STALE_AFTER=${LOCK_STALE_AFTER:-90}       # seconds; lock dir older than this is stolen

mkdir -p "$(dirname "$LOG")" "$INCIDENTS"

# --- Lock ---------------------------------------------------------------------

LOCK="$INCIDENTS/.lock"
acquire_lock() {
  if mkdir "$LOCK" 2>/dev/null; then
    return 0
  fi
  local age=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$age" -gt "$LOCK_STALE_AFTER" ]; then
    rm -rf "$LOCK"
    mkdir "$LOCK" 2>/dev/null && return 0
  fi
  return 1
}
if ! acquire_lock; then
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') SKIPPED — prior tick still running =====" >> "$LOG"
  exit 0
fi
trap 'rm -rf "$LOCK"' EXIT INT TERM

# --- Capture system state once ------------------------------------------------

NUM_FILES=$(sysctl -n kern.num_files 2>/dev/null || echo 0)
MAX_FILES=$(sysctl -n kern.maxfiles 2>/dev/null || echo 1)
NUM_FILES_PCT=$(( NUM_FILES * 100 / MAX_FILES ))

LSOF_TMP=$(mktemp -t fd-monitor-lsof)
lsof -n -P 2>/dev/null > "$LSOF_TMP"
LSOF_TOTAL=$(wc -l < "$LSOF_TMP" | tr -d ' ')

# top holders: "<count> <cmd>:<pid>" sorted desc
HOLDERS=$(awk 'NR>1 {print $1":"$2}' "$LSOF_TMP" | sort | uniq -c | sort -rn)

# --- Tick block to main log ---------------------------------------------------

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

# --- Sanity-gate incident detection -------------------------------------------
# If lsof returned almost nothing, it failed (or the system is under FD pressure
# severe enough that lsof itself couldn't enumerate). Skip incident dumps —
# writing forensics off truncated data is worse than writing none.

if [ "$LSOF_TOTAL" -lt "$MIN_LSOF_LINES" ]; then
  echo "!!!!! lsof returned only $LSOF_TOTAL lines (< $MIN_LSOF_LINES) — skipping incident detection" >> "$LOG"
  rm -f "$LSOF_TMP"
  # still rotate / cleanup below
else

# --- Incident detection -------------------------------------------------------

# Suspect pids: any holder above the per-pid threshold.
SUSPECT_PIDS=$(printf '%s\n' "$HOLDERS" | awk -v t="$SUSPECT_PID_FDS" '
  $1+0 > t+0 {
    n = split($2, a, ":");
    print a[n];   # last segment is pid (cmd may contain colons)
  }')

SYSTEM_INCIDENT=0
[ "$NUM_FILES_PCT" -ge "$SYSTEM_NUM_FILES_PCT" ] && SYSTEM_INCIDENT=1

now=$(date +%s)
sentinel_age() {
  local f="$1"
  [ -f "$f" ] || { echo 99999999; return; }
  echo $(( now - $(stat -f %m "$f" 2>/dev/null || echo 0) ))
}

if [ -n "$SUSPECT_PIDS" ] || [ "$SYSTEM_INCIDENT" = 1 ]; then
  TS=$(date '+%Y%m%d-%H%M%S')
  DIR="$INCIDENTS/$TS"

  # Decide which dumps to write based on cooldowns.
  WRITE_SYSTEM=0
  if [ "$SYSTEM_INCIDENT" = 1 ]; then
    AGE=$(sentinel_age "$INCIDENTS/.last-system")
    [ "$AGE" -ge "$SYSTEM_COOLDOWN" ] && WRITE_SYSTEM=1
  fi
  PIDS_TO_DUMP=()
  PIDS_THROTTLED=()
  for pid in ${=SUSPECT_PIDS}; do
    AGE=$(sentinel_age "$INCIDENTS/.last-pid-$pid")
    if [ "$AGE" -ge "$PID_COOLDOWN" ]; then
      PIDS_TO_DUMP+=("$pid")
    else
      PIDS_THROTTLED+=("$pid")
    fi
  done

  SUSPECT_PIDS_INLINE=$(printf '%s' "$SUSPECT_PIDS" | tr '\n' ' ' | sed 's/ *$//')
  {
    echo "!!!!! INCIDENT $TS  num_files_pct=$NUM_FILES_PCT  suspect_pids=${SUSPECT_PIDS_INLINE:-none}"
    if [ "$WRITE_SYSTEM" = 1 ] || [ ${#PIDS_TO_DUMP[@]} -gt 0 ]; then
      echo "!!!!! dumping: system=$WRITE_SYSTEM  pids=${PIDS_TO_DUMP[*]:-none}  throttled_pids=${PIDS_THROTTLED[*]:-none}"
      echo "!!!!! see: $DIR/"
    else
      echo "!!!!! all dumps throttled (cooldowns active); throttled_pids=${PIDS_THROTTLED[*]:-none}"
    fi
  } >> "$LOG"

  # Only create the dir if we're actually going to write something into it.
  if [ "$WRITE_SYSTEM" = 1 ] || [ ${#PIDS_TO_DUMP[@]} -gt 0 ]; then
    mkdir -p "$DIR"

    if [ "$WRITE_SYSTEM" = 1 ]; then
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
      touch "$INCIDENTS/.last-system"
    fi

    for pid in "${PIDS_TO_DUMP[@]}"; do
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
      touch "$INCIDENTS/.last-pid-$pid"
    done
  fi
fi

rm -f "$LSOF_TMP"
fi  # end LSOF_TOTAL sanity guard

# --- Lazy rotation of main log ------------------------------------------------

if [ -f "$LOG" ]; then
  LINES=$(wc -l < "$LOG" 2>/dev/null | tr -d ' ')
  if [ "${LINES:-0}" -gt "$MAX_LINES" ]; then
    mv "$LOG" "$LOG.1"
  fi
fi

# --- Incident-dir housekeeping ------------------------------------------------

# Time-based: drop dirs older than 14 days.
find "$INCIDENTS" -mindepth 1 -maxdepth 1 -type d -not -name '.*' -mtime +14 -exec rm -rf {} + 2>/dev/null

# Hard cap: if too many remain, drop the oldest by name (timestamps sort naturally).
DIRS_LIST=$(find "$INCIDENTS" -mindepth 1 -maxdepth 1 -type d -not -name '.*' 2>/dev/null | sort)
DIR_COUNT=$(printf '%s\n' "$DIRS_LIST" | grep -c '^.' )
if [ "${DIR_COUNT:-0}" -gt "$MAX_INCIDENT_DIRS" ]; then
  EXCESS=$(( DIR_COUNT - MAX_INCIDENT_DIRS ))
  printf '%s\n' "$DIRS_LIST" | head -n "$EXCESS" | xargs rm -rf 2>/dev/null
fi
