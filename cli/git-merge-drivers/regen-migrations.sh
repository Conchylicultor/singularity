#!/bin/sh
# Merge driver for drizzle migration files
# (server/src/db/migrations/*.sql, meta/_journal.json, meta/*_snapshot.json).
# args: %O %A %B %P
#
# Take the upstream side (leave %A untouched). Drop a marker so the post-rebase
# normalize step in `singularity push` knows to run `regen-migrations` (reset
# branch-local files + re-run drizzle-kit generate against the rebased schema).
# Without a conflict, the marker isn't dropped and we skip the wasteful regen.
# Use `git rev-parse --git-dir` because `.git` is a file inside a worktree.
GITDIR=$(git rev-parse --git-dir)
mkdir -p "$GITDIR/singularity-merge-markers"
touch "$GITDIR/singularity-merge-markers/migrations"
exit 0
