import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

/** The bundle/data subdir this primitive owns. Kept here so the launcher never
 *  has to know the literal name. */
const ASSET_MIRROR_SUBDIR = "asset-mirror";

/**
 * Seed the app-data asset-mirror cache from a release bundle on first run.
 *
 * Recursively copies every file under `<bundleRoot>/asset-mirror` into
 * `<dataDir>/asset-mirror`, creating parent dirs as needed. COPY-IF-ABSENT: any
 * file that already exists at the destination is skipped, so a user's
 * previously-downloaded samples are never clobbered and newly-shipped files are
 * filled in. No-op if `<bundleRoot>/asset-mirror` does not exist (e.g. a release
 * whose closure had no prewarm contributors).
 *
 * Synchronous on purpose — it runs once at launch, before the backend starts
 * serving mirror requests.
 */
export function seedAssetMirrorCache(opts: {
  bundleRoot: string;
  dataDir: string;
  log?: (m: string) => void;
}): void {
  const { bundleRoot, dataDir } = opts;
  const log = opts.log ?? (() => {});

  const src = join(bundleRoot, ASSET_MIRROR_SUBDIR);
  if (!existsSync(src)) return;

  const dest = join(dataDir, ASSET_MIRROR_SUBDIR);
  let copied = 0;

  const walk = (from: string, to: string): void => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const fromPath = join(from, entry.name);
      const toPath = join(to, entry.name);
      if (entry.isDirectory()) {
        walk(fromPath, toPath);
      } else if (entry.isFile() && !existsSync(toPath)) {
        copyFileSync(fromPath, toPath);
        copied++;
      }
    }
  };

  walk(src, dest);
  if (copied > 0) {
    log(`[asset-mirror] seeded ${copied} file(s) into ${dest}`);
  }
}
