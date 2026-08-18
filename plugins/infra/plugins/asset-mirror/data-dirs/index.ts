import { relative } from "node:path";
import { dataRoot, defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The mirror's on-disk cache: `<dir>/<mirrorId>/<file>`.
 *
 * Machine-wide, not worktree-scoped — one download per machine serves every
 * worktree. Purely derived: every byte here came from the mirror's declared
 * remote base and is re-fetched on the next miss, so deleting the whole tree
 * costs one download, never data.
 */
export const assetMirrorCache = defineDataDir({
  kind: "cache",
  name: "asset-mirror",
  owner: "infra/asset-mirror",
  description:
    "Lazily-downloaded remote assets, served same-origin thereafter (offline-capable after one warm-up)",
  reclaim: { kind: "safe" },
});

/**
 * Where the cache sits *relative to a data root* — `"cache/asset-mirror"`.
 *
 * For the one caller that must place this directory under a root that is NOT
 * this process's own: `seedAssetMirrorCache` copies a release bundle's baked
 * assets into a freshly-installed app's data dir, which may be a preview root in
 * `/tmp`. It cannot use `assetMirrorCache.path`, but it also must not spell the
 * directory a second time — it did, as a private `ASSET_MIRROR_SUBDIR` const,
 * and that copy would have gone on writing to the old spot after the migration
 * moved the real one, silently shipping a release whose bundled samples landed
 * where nothing reads them.
 *
 * Derived from the declaration rather than written out, so the two cannot drift.
 */
export function assetMirrorRelativeToRoot(): string {
  return relative(dataRoot(), assetMirrorCache.path);
}

export default [assetMirrorCache];
