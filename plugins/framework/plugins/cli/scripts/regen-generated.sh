#!/bin/sh
# Merge driver for fully auto-generated files (*.generated.ts, *.origin.jsonc,
# docs/plugins-compact.md, docs/plugins-details.md).
# git invokes us with: %O %A %B %P  (ancestor, current/temp, other, working-path)
# %A already holds the upstream/current side; leave it untouched and exit 0.
# Drop a marker so a normalize pass knows to regen the canonical content from
# the merged plugin sources. Whoever normalizes clears it: the `post-rewrite`
# git hook (after ANY rebase), `push` (around its own), or a full `build`. Marker
# names are owned by MERGE_MARKER_KINDS in ../core/internal/merge-markers.ts —
# shell cannot import it, so keep the two in sync. A surviving marker fails the
# `generated-artifacts-normalized` check. Use `git rev-parse --git-dir` because
# `.git` is a file (gitfile) inside a worktree.
GITDIR=$(git rev-parse --git-dir)
mkdir -p "$GITDIR/singularity-merge-markers"
touch "$GITDIR/singularity-merge-markers/generated"
exit 0
