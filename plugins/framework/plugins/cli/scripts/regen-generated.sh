#!/bin/sh
# Merge driver for fully auto-generated files (*.generated.ts, *.origin.jsonc,
# docs/plugins-compact.md, docs/plugins-details.md).
# git invokes us with: %O %A %B %P  (ancestor, current/temp, other, working-path)
# %A already holds the upstream/current side; leave it untouched and exit 0.
# Drop a marker so the post-rebase normalize step in `singularity push` knows
# to regen the canonical content from the rebased plugin sources. Use
# `git rev-parse --git-dir` because `.git` is a file (gitfile) inside a worktree.
GITDIR=$(git rev-parse --git-dir)
mkdir -p "$GITDIR/singularity-merge-markers"
touch "$GITDIR/singularity-merge-markers/generated"
exit 0
