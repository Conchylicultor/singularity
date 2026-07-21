#!/bin/zsh
# capture-wedge.sh <pid> <ws-url> — full forensic capture of a live-wedged CLI op.
#
# <pid>    the wedged op's pid (from its ops/<op>.json marker, or the watchdog report)
# <ws-url> the op's inspector URL: ws://<marker.inspect> — ops launch pre-armed
#          via cli/bin/inspect.ts, and the marker records the localhost:port/token.
#
# Captures: ps + per-thread CPU, 5s cpu delta, native `sample` (fingerprint
# chain), child tree, lsof, the durable progress-log tail, and TWO 10s
# symbolicated inspector CPU profiles (the deliverable — names the hot JS
# function). Never kills the specimen. Output lands OUTSIDE the repo tree.
set -u
PID=$1
WS=$2
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$HOME/.singularity/wedge-captures-manual/capture-$PID-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
echo "== capture $PID -> $OUT"

ps -o pid,ppid,%cpu,time,rss,state,command -p "$PID" > "$OUT/ps.txt" 2>&1
ps -M "$PID" > "$OUT/ps-threads.txt" 2>&1
ps -axo pid,ppid,stat,%cpu,time,command | awk -v p="$PID" '$2==p' > "$OUT/children.txt" 2>&1
lsof -p "$PID" > "$OUT/lsof.txt" 2>&1

# cpu delta over 5s — spinning vs idle, from a delta, never a single misreadable number
T1=$(ps -o time= -p "$PID"); sleep 5; T2=$(ps -o time= -p "$PID")
echo "cpu-time: $T1 -> $T2 (5s wall)" | tee "$OUT/cpu-delta.txt"

# native sample for the fingerprint chain (ties this specimen to the field wedges)
sample "$PID" 5 -file "$OUT/native.sample.txt" > /dev/null 2>&1
grep -c "0x8ecf40" "$OUT/native.sample.txt" > "$OUT/fingerprint-hits.txt" 2>&1 || true
echo "fingerprint 0x8ecf40 hits: $(cat "$OUT/fingerprint-hits.txt")"

# straggler state from the durable progress logs
grep "\"pid\":$PID" ~/.singularity/check-progress.jsonl 2>/dev/null | tail -8 > "$OUT/progress-tail.txt" || true
grep "\"pid\":$PID" ~/.singularity/build-progress.jsonl 2>/dev/null | tail -8 >> "$OUT/progress-tail.txt" || true
tail -2 "$OUT/progress-tail.txt"

# THE deliverable: two 10s sampling profiles via the inspector, spaced so a
# loop's evolution is visible
bun "$DIR/inspector-client.ts" "$WS" profile 10 "$OUT/profile-1.json" > "$OUT/profile-1.summary.txt" 2>&1
echo "--- profile 1 top ---"; head -30 "$OUT/profile-1.summary.txt"
sleep 60
bun "$DIR/inspector-client.ts" "$WS" profile 10 "$OUT/profile-2.json" > "$OUT/profile-2.summary.txt" 2>&1
echo "--- profile 2 top ---"; head -30 "$OUT/profile-2.summary.txt"

echo "== done: $OUT"
