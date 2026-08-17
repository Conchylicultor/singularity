import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The `layout-geometry` check's sidecar pass markers, one empty-ish JSON file per
 * css-subtree signature that has already passed the geometry suite.
 *
 * Host-global because the signature is content, not a checkout: a peer worktree
 * that already ran the suite for these exact bytes is a real pass, and sharing
 * the markers is what collapses the same-sig thundering herd to one Chromium
 * launch.
 *
 * `cache` in the strict sense — deleting it costs one browser launch on the next
 * build, never a wrong verdict.
 */
export const layoutLabDir = defineDataDir({
  kind: "cache",
  name: "layout-lab",
  owner: "primitives/css/layout-harness",
  description:
    "Pass markers for the layout-geometry check, keyed by css-subtree content signature",
  reclaim: { kind: "safe" },
  // Nothing moves on disk in this commit, and the name deliberately differs from
  // the current one (`layout-lab-cache`), so the legacy path is spelled exactly
  // as it is today — otherwise every worktree would re-launch the suite once.
  legacyLocation: {
    path: "layout-lab-cache",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [layoutLabDir];
