#!/bin/bash
# Worktree deletion forensics — who removes .claude/worktrees/<name>?
#
# Streams Apple's Endpoint Security events (eslogger, root-only) and records
# every process that deletes a file inside a worktree checkout, or that execs a
# command naming one. ES has no rmdir event, so a tree removal is caught by the
# unlink burst it must produce; the FIRST unlink per (worktree, pid) already
# names the actor, so the rest are collapsed away.
#
# This sits UNDERNEATH the app: it sees the deletion whoever does it, in-process
# (Node/Bun fs.rm) or via a subprocess (git worktree remove, rm -rf), and it
# survives the app restarting — which is exactly what the in-app audit cannot do.
#
# Output: ~/.singularity/logs/worktree-removal-monitor.jsonl   (one JSON per line)
# Errors: ~/.singularity/logs/worktree-removal-monitor.err
#
# Root-only (eslogger needs an Endpoint Security client), so unlike the other
# monitors here this installs as a LaunchDaemon, not a LaunchAgent. That also
# means $HOME is /var/root under launchd — every path below is absolute.
#
# Run as root:  sudo sidequests/monitors/worktree-removal/worktree-removal-monitor.sh

set -uo pipefail

OUT="${WORKTREE_MONITOR_OUT:-/Users/epot/.singularity/logs/worktree-removal-monitor.jsonl}"
ERR="${OUT%.jsonl}.err"
MARK='/.claude/worktrees/'
WINDOW=300 # seconds; collapse repeat (worktree,pid,kind) hits inside this

if [ "$(id -u)" != "0" ]; then
  echo "must run as root — eslogger needs an Endpoint Security client" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
printf '{"kind":"monitor-start","pid":%s,"wallclock":"%s"}\n' "$$" "$(date -u +%FT%TZ)" >>"$OUT"
# Written by root into the user's data dir — keep it readable (and deletable)
# without sudo, so reading the log is never itself a privileged operation.
chmod 644 "$OUT" 2>/dev/null
chown epot "$OUT" "$ERR" 2>/dev/null

# 1. eslogger — the raw ES stream, one JSON event per line.
# 2. grep -F  — the cheap pre-filter. Only lines naming a worktree path survive,
#               so jq never parses the system-wide unlink firehose.
# 3. jq       — emit "<key>\t<epoch>\t<projected json>". Field paths are tolerant
#               (`//` fallbacks) so a schema shift degrades to nulls, not a crash.
#               jq also supplies the clock: macOS awk has no systime/strftime.
# 4. awk      — collapse the burst on the key, and capture the actor's live
#               process ancestry on the first hit (what ES alone cannot give us).
eslogger exec unlink 2>>"$ERR" \
  | grep --line-buffered -F "$MARK" \
  | grep --line-buffered -vE '/(node_modules|dist|\.git|\.cache|coverage|\.turbo)/' \
  | jq -rc --unbuffered '
      def proc: .process;
      def wt:
        [ (.event.unlink.target.path // ""),
          ((.event.exec.target.args // []) | join(" ")) ]
        | join(" ")
        | capture("/\\.claude/worktrees/(?<n>[^/ \"]+)").n // "?";
      { t:        (.time // .event_time // null),
        kind:     (if .event.exec then "exec" elif .event.unlink then "unlink" else (.event | keys[0]) end),
        worktree: wt,
        path:     (.event.unlink.target.path // null),
        argv:     (.event.exec.target.args // null),
        newexe:   (.event.exec.target.executable.path // null),
        pid:      (proc.audit_token.pid // null),
        ppid:     (proc.ppid // null),
        oppid:    (proc.original_ppid // null),
        exe:      (proc.executable.path // null),
        signid:   (proc.signing_id // null),
        team:     (proc.team_id // null),
        resp:     (proc.responsible_audit_token.pid // null),
        wallclock:(now | todate) }
      | "\(.worktree)|\(.pid)|\(.kind)\t\(now | floor)\t\(tojson)"
    ' 2>>"$ERR" \
  | awk -F'\t' -v out="$OUT" -v window="$WINDOW" '
      { key = $1; t = $2 + 0; rec = $3
        if ((key in seen) && (t - seen[key] < window)) next
        seen[key] = t

        # Live ancestry of the actor: mid-delete the process is usually still
        # running, and its parent chain is what names the real caller.
        anc = ""; split(key, k, "|")
        if (k[2] != "" && k[2] != "null") {
          cmd = "ps -o pid=,ppid=,user=,command= -p " k[2] " 2>/dev/null | head -1"
          if ((cmd | getline anc) <= 0) anc = ""
          close(cmd); gsub(/["\\]/, "", anc)
        }
        printf("%s,\"ancestry\":\"%s\"}\n", substr(rec, 1, length(rec) - 1), anc) >> out
        fflush(out) }
    '
