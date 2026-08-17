import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The user layer of the three-layer config model: one `<worktree>/` subtree per
 * namespace, holding the propagated `<name>.origin.jsonc` files and the user's
 * own `<name>.jsonc` overrides (plus `.ancestor.jsonc` conflict snapshots).
 *
 * A worktree's subtree is forked from main's on create (`forkConfig`) and reaped
 * with the worktree (`debug/worktree-cleanup`), so consumers name a namespace
 * through `.file(name)` rather than re-deriving the layout.
 */
export const configDir = defineDataDir({
  kind: "state",
  name: "config",
  owner: "config_v2",
  description:
    "The user config layer: per-worktree propagated origins plus the user's own JSONC overrides and conflict ancestors",
  // The override files are the user's own edits — hand-written or made through
  // Settings — and exist nowhere else. Deleting them silently reverts every
  // customization to the committed defaults.
  reclaim: {
    kind: "never",
    reason:
      "the user's own config overrides live here and exist nowhere else; deleting them silently reverts every customization",
  },
  // TEMPORARY. Byte-for-byte where it is today; the layout migration relocates
  // it under `state/`.
  legacyLocation: {
    path: "config",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [configDir];
