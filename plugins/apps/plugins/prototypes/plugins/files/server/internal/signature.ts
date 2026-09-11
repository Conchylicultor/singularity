import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { listPrototypeDirNames } from "../../shared/read-folder";
import { prototypesDir } from "../../data-dirs";

/**
 * What the prototypes tree looks like right now, one comparable string per
 * prototype folder: every file in it with its size and mtime.
 *
 * This is the answer to "did anything actually change?", and it is what the
 * version bump is gated on. A watcher event is a hint that something MIGHT have
 * changed — parcel also reports a touch, a chmod, an atomic-save's temp file,
 * and (before this) a timer tick — and the gallery's version is a cache-bust
 * that RELOADS every open prototype iframe, throwing away whatever state the
 * author had built up on screen. So an unchanged tree must produce an unchanged
 * signature, and therefore no reload.
 *
 * `(size, mtime)` rather than content: prototypes live outside every checkout
 * (nothing ever rewrites their mtimes behind the author's back), a rewrite the
 * author makes always moves the mtime, and this runs on a 30s timer — so it has
 * to stay a handful of stats.
 *
 * Per folder rather than one string for the tree, because a prototype's
 * version history cares WHICH prototype moved: the diff of two signatures
 * ({@link changedPrototypes}) is the set whose `dirty` flag may have flipped.
 */
export async function readPrototypesSignature(): Promise<Map<string, string>> {
  const dirNames = await listPrototypeDirNames(prototypesDir.path);

  const signature = new Map<string, string>();
  for (const dirName of dirNames) {
    const dirAbs = join(prototypesDir.path, dirName);
    let entries;
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue; // removed mid-walk
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
    signature.set(dirName, parts.join("\n"));
  }
  return signature;
}

/** The prototypes added, removed or edited between two signatures. */
export function changedPrototypes(
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  const changed: string[] = [];
  for (const [name, sig] of after) {
    if (before.get(name) !== sig) changed.push(name);
  }
  for (const name of before.keys()) {
    if (!after.has(name)) changed.push(name);
  }
  return changed;
}
