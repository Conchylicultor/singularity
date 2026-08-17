import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The authored prototypes — one flat folder each, holding a self-contained
 * `index.html` plus whatever flat files it references.
 *
 * Host-global and deliberately NOT in git: one shared set that every worktree
 * backend and main serve, so a mock is live the moment it is written and
 * survives the worktree that authored it. That is exactly why `reclaim` is
 * `never` — git is not the safety net here, the `prototypes` backup source is,
 * and the folder on disk is the only copy of the work.
 *
 * Declared by `files` rather than by the app namespace above it because `files`
 * is the plugin that owns the tree: it creates the directory, seeds `_template/`
 * into it, serves it, and runs the one watcher over it. `thumbnails` reads the
 * same tree and takes this declaration from the `files` server barrel.
 */
export const prototypesDir = defineDataDir({
  kind: "apps",
  name: "prototypes",
  owner: "apps/prototypes/files",
  description:
    "Authored UI prototypes — one self-contained folder each, shared by every worktree and main",
  reclaim: {
    kind: "never",
    reason:
      "authored prototypes are not in git — the folder on disk is the only copy",
  },
  // Nothing moves on disk in this commit. A declaration resolving to the new
  // `apps/prototypes` would point at a directory that does not exist yet, and
  // the gallery would report every prototype gone.
  legacyLocation: {
    path: "prototypes",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [prototypesDir];
