// One prototype folder's signature — every file in it with its size and mtime —
// and the short `rev` derived from it. `shared/`, not `server/`, because the
// lister (`list-metas.ts`, also run by the CLI) stamps each meta with its `rev`,
// and the server's watcher compares the same signatures to decide what moved.

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** One file of a prototype folder, as the signature sees it. */
export interface FolderFile {
  name: string;
  size: number;
  mtimeMs: number;
}

/**
 * Every file in one prototype folder with its size and mtime, sorted by name —
 * dot-files and sub-folders skipped. `null` when the folder is gone (removed
 * mid-walk).
 *
 * `(size, mtime)` rather than content: prototypes live outside every checkout
 * (nothing ever rewrites their mtimes behind the author's back), a rewrite the
 * author makes always moves the mtime, and the watcher re-reads this on a 30s
 * timer — so it has to stay a handful of stats.
 */
export async function readFolderFiles(
  dirAbs: string,
): Promise<FolderFile[] | null> {
  let entries;
  try {
    entries = await readdir(dirAbs, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const files: FolderFile[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    try {
      const s = await stat(join(dirAbs, entry.name));
      files.push({ name: entry.name, size: s.size, mtimeMs: s.mtimeMs });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return files;
}

/** A folder's files as `name:size:mtimeMs`, one per line — its signature. */
export function signatureOfFiles(files: FolderFile[]): string {
  return files.map((f) => `${f.name}:${f.size}:${f.mtimeMs}`).join("\n");
}

/** {@link readFolderFiles} as its signature string; `null` when the folder is gone. */
export async function readFolderSignature(
  dirAbs: string,
): Promise<string | null> {
  const files = await readFolderFiles(dirAbs);
  return files === null ? null : signatureOfFiles(files);
}

/**
 * A short, stable name for a folder signature — `PrototypeMeta.rev`. The same
 * bytes on disk give the same rev in every process and across restarts, so a
 * live frame keyed on it reloads only when ITS files really changed.
 */
export function revOfSignature(signature: string): string {
  return createHash("sha1").update(signature).digest("hex").slice(0, 12);
}
