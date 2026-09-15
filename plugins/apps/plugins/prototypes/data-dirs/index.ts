import { defineAppDataDir } from "@plugins/infra/plugins/paths/core";
import { prototypesApp } from "@plugins/apps/plugins/prototypes/plugins/shell/core";

/**
 * The Prototypes app's one data dir, `apps/prototypes`. Today it holds the
 * authored prototypes — one flat folder each, a self-contained `index.html`
 * plus whatever flat files it references — and `_history/`, the private git
 * repo per prototype that records its versions.
 *
 * Host-global and deliberately NOT in git: one shared set that every worktree
 * backend and main serve, so a mock is live the moment it is written and
 * survives the worktree that authored it. Git is not the safety net here, the
 * `prototypes` backup source is, and the folder on disk is the only copy of the
 * work — which is why an app dir is never reclaimable.
 *
 * Declared at the app root rather than by `files` (the sub-plugin that creates,
 * seeds, serves and watches the tree) because an app owns exactly ONE data dir
 * and everything the app keeps durably goes inside it. A sub-plugin that needs
 * its own area takes one with `prototypesDir.subdir("<area>")`, never a second
 * `apps/*` dir beside this one. Regenerable output stays out: the gallery
 * thumbnails are a `cache/` dir of their own.
 *
 * Every consumer — `files`, `thumbnails`, the `prototypes` backup source, the
 * main-edits guard — imports this declaration directly; nobody re-derives the
 * path or re-exports the symbol.
 *
 * `shell/core` must never import this file: it reads `prototypesApp` from
 * there, so the reverse edge would close a cycle.
 */
export const prototypesDir = defineAppDataDir(prototypesApp, {
  owner: "apps/prototypes",
  description:
    "Authored UI prototypes (one self-contained folder each) and their per-prototype version history, shared by every worktree and main",
});

export default [prototypesDir];
