# FD monitor — diagnose macOS "too many files open" crashes

A launchd agent that snapshots system FD-table and process state every 30s into `~/.singularity/logs/fd-monitor.log`, plus dumps a forensic snapshot to `~/.singularity/logs/fd-monitor-incidents/<ts>/` whenever any single process holds an unusual number of FDs or `kern.num_files` crosses a fraction of `kern.maxfiles`.

## Why

Originally set up because Singularity was the leading suspect for "too many files open" crashes (long-lived gateway, many spawned bun backends, accumulating worktrees / Postgres DBs / tmux sessions). The monitor captured a real spike on 2026-04-26 and showed the leak was a runaway **Claude CLI** child process (pid held 65,489 FDs in <30s; `lsof` itself failed mid-run; system rebooted seconds later). Singularity processes were normal throughout. The monitor is being kept active to catch future repeats and gather full forensics.

## What it captures

Each tick appends a block like:

```
===== 2026-04-26 11:55:00 =====
kern.num_files: 6894
kern.maxfiles: 245760
kern.maxproc: 4176
kern.maxfilesperproc: 122880
ps_count=412
lsof_total=11980
--- top 20 FD holders (count cmd:pid) ---
   429 gateway:1436
   213 bun:1498
   ...
--- top 10 FD-holding command groups ---
   1820 bun
    873 Code
    ...
--- singularity quick stats ---
gateway_pid=1436
gateway_fds=429
bun_backends=2
tmux_sessions=16
claude_cli_procs=3
postgres_backends=28
worktree_jsons=349
```

When a crash happens, `tail -n 500` of the log reveals which command shot up.

### Incident dumps

If any pid holds more than `SUSPECT_PID_FDS` (default **3000**) FDs, or `kern.num_files` crosses `SYSTEM_NUM_FILES_PCT` (default **25%**) of `kern.maxfiles`, this tick *also* writes a forensic dump to:

```
~/.singularity/logs/fd-monitor-incidents/<YYYYMMDD-HHMMSS>/
├── system.txt           # kernel state, top 50 cmd:pid, top 20 cmd groups, full ps
├── system.lsof.gz       # gzipped system-wide lsof at incident time
├── pid<pid>.txt         # ps line, FD type/kind breakdown, top 30 names per suspect pid
└── pid<pid>.lsof.gz     # gzipped full lsof for that pid
```

The main log gets a `!!!!! INCIDENT <ts>` annotation pointing at the dir, so `grep '!!!!!' fd-monitor.log` is the fast way to find them.

Why dump *during* the tick: the leaker often dies before the next tick (hits `kern.maxfilesperproc` and is killed, or the box crashes). The lsof we already captured this tick is the only evidence of what it had open.

Override thresholds via env vars on the LaunchAgent if needed:

```sh
SUSPECT_PID_FDS=5000 SYSTEM_NUM_FILES_PCT=40 zsh sidequests/fd-monitor/fd-monitor.sh
```

Incident dirs older than 14 days are auto-purged.

## Files

```
├── fd-monitor.sh                 # the snapshot script
├── com.epot.fd-monitor.plist     # LaunchAgent (runs every 30s)
└── CLAUDE.md
```

## Install

```sh
chmod +x sidequests/fd-monitor/fd-monitor.sh
cp sidequests/fd-monitor/com.epot.fd-monitor.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.epot.fd-monitor.plist
```

Verify it's running:

```sh
launchctl list | grep fd-monitor
tail -f ~/.singularity/logs/fd-monitor.log
```

A new block should appear every 30s.

## Update

After editing the script (no plist change needed — script path is stable):

```sh
# changes pick up on the next tick automatically
tail -f ~/.singularity/logs/fd-monitor.log
```

After editing the plist:

```sh
launchctl unload ~/Library/LaunchAgents/com.epot.fd-monitor.plist
cp sidequests/fd-monitor/com.epot.fd-monitor.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.epot.fd-monitor.plist
```

## Uninstall

```sh
launchctl unload ~/Library/LaunchAgents/com.epot.fd-monitor.plist
rm ~/Library/LaunchAgents/com.epot.fd-monitor.plist
```

The log file at `~/.singularity/logs/fd-monitor.log` is left in place; delete manually if you want.

## Cost

`lsof -n -P` of the entire system runs in ~0.5–2s and is the heaviest part of each tick. At 30s intervals this is negligible. If it ever shows up in profiles, raise `StartInterval` to 60.

## After a crash — how to read the log

```sh
# Find the gap in timestamps that brackets the crash
grep '^=====' ~/.singularity/logs/fd-monitor.log | tail -50

# Pull the last 200 lines before that gap and look for:
#   - lsof_total trending upward fast
#   - kern.num_files approaching kern.maxfiles
#   - ps_count approaching kern.maxproc
#   - top FD holders changing (a runaway pid sticking near the top)
```

Findings to bring back: the top FD-holding command in the final block, any single (cmd:pid) above ~5000 FDs, and whether the kernel limits were actually saturated.
