import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * A folder's content fingerprint: sha256 over every file's name and bytes, in
 * sorted order.
 *
 * Content rather than `(mtime, size)` on purpose. The thumbnail cache is
 * host-global, so hashing content lets two worktrees holding the same prototype
 * share one rendered PNG, and a `git checkout` that rewrites mtimes without
 * changing bytes does not trigger a pointless re-render. It costs one read of a
 * folder that is ~20 KB by contract.
 *
 * Flat by construction — `prototypes:self-contained` rejects a subdirectory —
 * so a shallow read is the whole folder. A directory entry that somehow exists
 * is skipped rather than folded in as a name with no bytes.
 *
 * Deliberately dependency-free (node + Bun only): it takes the directory it
 * hashes, so nothing about the prototypes tree reaches into it and a test can
 * point it at a temp folder.
 */
export async function fingerprintDir(dir: string): Promise<string> {
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(new Uint8Array(await Bun.file(join(dir, file)).arrayBuffer()));
    hash.update("\0");
  }
  return hash.digest("hex");
}
