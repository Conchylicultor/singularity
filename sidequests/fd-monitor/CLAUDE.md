# FD monitor — diagnose macOS "too many files open" crashes

A launchd agent that snapshots system FD-table and process state every 30s into `~/.singularity/logs/fd-monitor.log`. Goal: when the Mac next hits a system-wide "too many files open" event, the log tells us *which process family* was burning FDs in the minute leading up to it.

## Why

Singularity is a strong suspect for these crashes (long-lived gateway, many spawned bun backends, accumulating worktrees / Postgres DBs / tmux sessions), but the visible idle-state numbers don't add up to a crash on their own. The monitor captures the actual pressure at crash time so we can stop guessing.

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
