// One prototype folder's signature — every file in it with its size and mtime —
// and the short `rev` derived from it. `shared/`, not `server/`, because the
// lister (`list-metas.ts`, also run by the CLI) stamps each meta with its `rev`,
// and the server's watcher compares the same signatures to decide what moved.

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Every file in one prototype folder as `name:size:mtimeMs`, one per line,
 * sorted by name — dot-files and sub-folders skipped. `null` when the folder is
 * gone (removed mid-walk).
 *
 * `(size, mtime)` rather than content: prototypes live outside every checkout
 * (nothing ever rewrites their mtimes behind the author's back), a rewrite the
 * author makes always moves the mtime, and the watcher re-reads this on a 30s
 * timer — so it has to stay a handful of stats.
 */
export async function readFolderSignature(
  dirAbs: string,
): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dirAbs, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const parts: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    try {
      const s = await stat(join(dirAbs, entry.name));
      parts.push(`${entry.name}:${s.size}:${s.mtimeMs}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return parts.join("\n");
}

/**
 * A short, stable name for a folder signature — `PrototypeMeta.rev`. The same
 * bytes on disk give the same rev in every process and across restarts, so a
 * live frame keyed on it reloads only when ITS files really changed.
 */
export function revOfSignature(signature: string): string {
  return createHash("sha1").update(signature).digest("hex").slice(0, 12);
}
