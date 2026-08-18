import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The rendered gallery thumbnails, one PNG per prototype content fingerprint.
 *
 * `cache`, and genuinely so: the filename IS the folder's content hash, so
 * anything deleted here is re-rendered on the next sync — which is also why the
 * plugin's own sweep can be a dumb age-based unlink.
 *
 * Host-global (outside every worktree) on purpose: two worktrees holding a
 * byte-identical prototype address the same PNG and share one render. It also
 * has to live outside the prototypes tree itself — `prototypes:self-contained`
 * rejects any subdirectory in a prototype folder.
 */
export const thumbnailCacheDir = defineDataDir({
  kind: "cache",
  name: "prototypes-thumbnails",
  owner: "apps/prototypes/thumbnails",
  description: "Rendered prototype gallery thumbnails, keyed by content hash",
  reclaim: { kind: "safe" },
});

export default [thumbnailCacheDir];
