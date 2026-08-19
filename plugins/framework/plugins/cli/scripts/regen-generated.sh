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
# `generated-artifacts-normalized` check.
# WHERE the marker lands is load-bearing, and getting it wrong is silent: the
# reader is readMergeMarkers() in ../core/internal/merge-markers.ts, which
# resolves the dir from THIS checkout's own git dir (following the `.git`
# gitfile a linked worktree has in place of a directory). Ask git for that same
# answer with the ambient GIT_* pointers unset — git exports GIT_DIR to a merge
# driver, and a caller or an in-progress rewrite can have it naming something
# else, which would drop the marker where nothing ever looks for it;
# `.githooks/post-rewrite` unsets the same four before its own git calls. The
# fallback keeps a caller whose cwd is outside the worktree working, and no
# answer at all is fatal rather than skipped: a driver that quietly loses its
# marker is precisely the failure this resolution exists to prevent.
GITDIR=$(unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY; git rev-parse --absolute-git-dir 2>/dev/null) ||
  GITDIR=$(git rev-parse --absolute-git-dir 2>/dev/null) || GITDIR=""
if [ -z "$GITDIR" ]; then
  echo "regen-generated merge driver: cannot resolve this checkout's git dir; refusing to merge without recording the normalize marker." >&2
  exit 1
fi
mkdir -p "$GITDIR/singularity-merge-markers"
touch "$GITDIR/singularity-merge-markers/generated"
exit 0
