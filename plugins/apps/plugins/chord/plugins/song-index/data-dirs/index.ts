import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * Sheet Sage's two Hooktheory files (116 MB, pinned commit and sha256), plus
 * the host-wide lock that makes one process build the snapshot at a time.
 *
 * `cache`, and genuinely so: both files are refetched from the pinned URLs
 * when missing. The snapshot built from them is NOT here — it lives in the
 * app's own dir (`chordDir.subdir("song-index")`), where backups keep it, so
 * reclaiming this cache can never take the one copy that survives the
 * upstream files disappearing.
 *
 * Host-global on purpose: every worktree on the machine shares one download.
 */
export const sheetSageCacheDir = defineDataDir({
  kind: "cache",
  name: "chord-sheetsage",
  owner: "apps/chord/song-index",
  description:
    "Sheet Sage's Hooktheory dump files (pinned, sha256-checked), refetched when missing",
  reclaim: { kind: "safe" },
});

export default [sheetSageCacheDir];
