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
# Output: ~/.singularity/logs/monitors/worktree-removal-monitor.jsonl   (one JSON per line)
# Errors: ~/.singularity/logs/monitors/worktree-removal-monitor.err
#
# Root-only (eslogger needs an Endpoint Security client), so unlike the other
# monitors here this installs as a LaunchDaemon, not a LaunchAgent. That also
# means $HOME is /var/root under launchd — every path below is absolute.
#
# Run as root:  sudo sidequests/monitors/worktree-removal/worktree-removal-monitor.sh

set -uo pipefail

OUT="${WORKTREE_MONITOR_OUT:-/Users/epot/.singularity/logs/monitors/worktree-removal-monitor.jsonl}"
ERR="${OUT%.jsonl}.err"
WINDOW=300 # seconds; collapse repeat (worktree,pid,kind) hits inside this

# The pre-filter runs on the RAW line, before any JSON parsing, so it must
# tolerate how the emitter escapes a path. Foundation's JSON encoder writes
# forward slashes as `\/`, so a fixed-string `/.claude/worktrees/` matches
# nothing — the failure is silent and total (the monitor runs, logs cleanly, and
# sees zero events). Hence `\\?/`: match the slash with or without its escape.
MARK='\.claude\\?/worktrees'
# Build-churn paths, excluded for VOLUME only, NOT correctness: a real tree
# removal also deletes plugins/, docs/, research/, so it cannot hide behind these.
#
# Applied inside jq against the parsed unlink path, NEVER as a grep over the raw
# line: an exec event embeds the whole environment, and PATH nearly always
# contains `node_modules`, so a raw-line `grep -v` silently discarded every exec
# — including the `git worktree remove` this monitor exists to catch.
NOISE='/(node_modules|dist|\.git|\.cache|coverage|\.turbo)/'

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
# Optional raw tap: WORKTREE_MONITOR_RAW=/tmp/es-raw.json captures the first 200
# UNFILTERED events so the emitter's actual schema and escaping can be checked
# without a second privileged run. Bounded by `head`, so it cannot fill the disk
# if left on. Off by default.
tap() {
  if [ -n "${WORKTREE_MONITOR_RAW:-}" ]; then
    tee >(head -200 >"$WORKTREE_MONITOR_RAW")
  else
    cat
  fi
}

eslogger exec unlink 2>>"$ERR" \
  | tap \
  | grep --line-buffered -E "$MARK" \
  | jq -rc --unbuffered --arg noise "$NOISE" '
      def proc: .process;
      def args: (.event.exec.args // []);
      def execname: ((.event.exec.target.executable.path // "") | split("/") | last);

      # The worktree name is read ONLY from the deleted path or the command line
      # — never from the exec cwd or env. Every command an agent runs carries its
      # worktree in both, so trusting them makes each agent keystroke a "hit":
      # the first live run logged 150 junk records a minute this way.
      def wt:
        [ (.event.unlink.target.path // ""), (args | join(" ")) ]
        | join(" ")
        | capture("/\\.claude/worktrees/(?<n>[A-Za-z0-9._-]+)").n // "?";

      # unlink is ground truth and unevadable. exec is a convenience layer that
      # adds the literal command line, so it is kept only when the command is
      # plausibly a removal — otherwise every `ls <worktree path>` an agent runs
      # would land in the log.
      #
      # Matched against argv ELEMENTS, never the joined string: a shell -c script
      # is ONE element, so a command that merely MENTIONS the phrase (a commit
      # message, this file) is not a removal. Substring matching made every such
      # command a hit.
      # NB: no apostrophes anywhere in this jq program — it is a bash
      # single-quoted string, so one would silently truncate it.
      def isRemoval:
        (execname | IN("rm","rmdir","unlink","trash","mv"))
        or ((args | index("worktree")) and (args | (index("remove") // index("prune"))));

      . as $e | ($e | wt) as $w
      | select($w | test("^[A-Za-z0-9._-]+$"))
      | select(($e.event.exec | not) or ($e | isRemoval))
      | select((($e.event.unlink.target.path // "") | test($noise)) | not)
      | { t:        ($e.time // null),
          kind:     (if $e.event.exec then "exec" elif $e.event.unlink then "unlink" else ($e.event | keys[0]) end),
          worktree: $w,
          path:     ($e.event.unlink.target.path // null),
          argv:     ($e.event.exec.args // null),
          newexe:   ($e.event.exec.target.executable.path // null),
          pid:      ($e | proc.audit_token.pid // null),
          ppid:     ($e | proc.ppid // null),
          oppid:    ($e | proc.original_ppid // null),
          exe:      ($e | proc.executable.path // null),
          signid:   ($e | proc.signing_id // null),
          team:     ($e | proc.team_id // null),
          resp:     ($e | proc.responsible_audit_token.pid // null),
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
