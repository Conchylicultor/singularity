#!/bin/bash
# new-session.sh — Opens a fresh Claude Code session in tmux
#
# Bookmark: localhost:8102
# Each browser tab spawns a new tmux session immediately, no menu.
# Claude starts in a fresh git worktree for isolation.

WORKDIR="/Users/admin/__A__/dev/singularity"
PREFIX="claude"
TMUX="/opt/homebrew/bin/tmux"
CLAUDE="/Users/admin/.local/bin/claude"
GIT=/usr/bin/git
WORKTREE_DIR="$WORKDIR/.claude/worktrees"

name="${PREFIX}-$(date +%s)"
branch="claude-web/$name"
wt_path="$WORKTREE_DIR/$name"

# Create a new worktree with a fresh branch off main
$GIT -C "$WORKDIR" worktree add -b "$branch" "$wt_path" main 2>/dev/null

$TMUX -u new-session -d -s "$name" -c "$wt_path" "zsh -l -c '$CLAUDE'"
exec $TMUX -u attach -t "$name"
