#!/bin/bash
# new-session.sh — Opens a fresh Claude Code session in tmux
#
# Bookmark: localhost:8102
# Each browser tab spawns a new tmux session immediately, no menu.

WORKDIR="/Users/admin/__A__/dev/singularity"
PREFIX="claude"
TMUX="/opt/homebrew/bin/tmux"
CLAUDE="/Users/admin/.local/bin/claude"

name="${PREFIX}-$(date +%s)"
$TMUX -u new-session -d -s "$name" -c "$WORKDIR" "zsh -l -c '$CLAUDE'"
exec $TMUX -u attach -t "$name"
