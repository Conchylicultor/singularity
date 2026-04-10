# Claude Web — Browser-based Claude Code sessions

Exposes Claude Code in the browser via [ttyd](https://github.com/nicehash/ttyd) + [tmux](https://github.com/tmux/tmux).

## Problem

Running Claude Code directly through ttyd (without tmux) causes sessions to be lost when the browser tab closes or the screen locks. The websocket disconnects, leaving orphaned Claude processes that can't be reconnected.

## Solution

tmux sits between ttyd and Claude Code. When the browser disconnects, tmux detaches but keeps Claude alive. Reconnecting is possible through the session picker.

## Ports

| Port | Bookmark | What |
|------|----------|------|
| 8102 | New session | Always launches a fresh Claude session in a new tmux |
| 8103 | Session picker | Lists existing tmux sessions with keyboard navigation, or create a new one |

## Files

```
├── new-session.sh           # Port 8102: instant new session
├── session-picker.sh        # Port 8103: arrow-key session menu
├── com.epot.claude-new.plist      # LaunchAgent for port 8102
├── com.epot.claude-picker.plist   # LaunchAgent for port 8103
└── CLAUDE.md
```

## How it works

1. **ttyd** listens on the port and spawns the script on each browser connection
2. The script creates (or reattaches to) a **tmux** session
3. Inside tmux, Claude Code runs via `zsh -l` (login shell for full PATH)
4. On browser disconnect: tmux detaches, Claude keeps running
5. On reconnect via 8103: picker shows existing sessions to reattach

## Install / Update

After editing the plist files, reinstall them:

```sh
launchctl unload ~/Library/LaunchAgents/com.epot.claude-new.plist 2>/dev/null
launchctl unload ~/Library/LaunchAgents/com.epot.claude-picker.plist 2>/dev/null
cp sidequests/claude-web/com.epot.claude-*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.epot.claude-new.plist
launchctl load ~/Library/LaunchAgents/com.epot.claude-picker.plist
```

## Copy-paste

ttyd uses xterm.js which intercepts mouse events, so normal browser text selection doesn't work when tmux mouse mode is on. The fix is to bind tmux's `MouseDragEnd1Pane` to pipe the selection to `pbcopy`:

```bash
# ~/.tmux.conf
set -g mouse on
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"
bind-key -T copy-mode    MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"
```

Workflow: click-drag to select text, release mouse button, `Cmd+V` to paste anywhere.

## Dependencies

- `ttyd` — `brew install ttyd`
- `tmux` — `brew install tmux`
- `~/.tmux.conf` — must have UTF-8 and 256-color support for Claude's UI to render correctly
