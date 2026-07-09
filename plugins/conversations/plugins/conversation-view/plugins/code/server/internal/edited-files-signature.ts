import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { runGit } from "@plugins/primitives/plugins/commit-list/server";
import { type DirtyEntry, editedFilesEtag, parsePorcelainZ } from "./edited-files-etag";

// lstat one dirty path for its (mtime, size) — git's stat-cache dirty signal.
// A deleted/vanished path (status "D", or a race) can't be stat'd; ENOENT is the
// expected case there, so we degrade to -1 sentinels (which still flip the ETag on
// a present→deleted transition — the porcelain code changes too). Any OTHER error
// is unexpected and re-thrown so it fails loudly rather than serving a signature
// built on a silent read failure.
async function statEntry(
  worktreePath: string,
  entry: { code: string; path: string },
): Promise<DirtyEntry> {
  try {
    const st = await lstat(resolve(worktreePath, entry.path));
    return { code: entry.code, path: entry.path, mtimeMs: st.mtimeMs, size: st.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { code: entry.code, path: entry.path, mtimeMs: -1, size: -1 };
  }
}

/**
 * The CONTENT signature of `edited-files` for one worktree — the single
 * authority behind both the resource's `revalidate` and its `loader` (they are
 * the two bound halves of one `createSignedMemo`; see edited-files-cache.ts).
 *
 * It is a faithful, conservative over-approximation: it changes whenever
 * `computeEditedFiles`' value could change (serving stale is a correctness bug;
 * a needless recompute is merely a missed optimization).
 *
 *   - `(headSha, mergeBase)` covers the committed branch diff. Both name
 *     immutable trees, so a commit/amend/rebase moves headSha and a `main`
 *     advance moves mergeBase. A porcelain-only signature would MISS an amend
 *     that leaves the working tree clean.
 *   - The per-dirty-file `(code, lstat mtimeMs+size)` covers the uncommitted
 *     working-tree changes AND their line counts. Porcelain output alone is NOT
 *     enough: a file already `M` can gain more edits while its status line stays
 *     identical, yet its numstat (and thus the value) changes. Folding in git's
 *     own stat-cache dirty signal catches that with one `lstat` per dirty file
 *     (no content read) — strictly cheaper than the loader's two `git diff`
 *     passes plus untracked line counts.
 *
 * Because it moves on an uncommitted save with no SHA change, this — and not the
 * watcher generation counter it replaced — is the correct memo signature. Keeping
 * it content-addressed also keeps the wire ETag stable across a server restart,
 * preserving the cross-restart 304 herd-collapse `revalidate` exists for.
 *
 * Cheap and UNGATED: 1 `rev-parse` + 1 `merge-base` + 1 `git status` + an `lstat`
 * per dirty file. It runs on every read, so it must never acquire a heavy slot.
 *
 * This module is a LEAF on purpose: the memo declaration imports it, so it must
 * never import the memo back (import cycle).
 *
 * See research/2026-07-09-global-etag-value-coproduction.md.
 */
export async function editedFilesSignature(worktreePath: string): Promise<string> {
  // runGit throws on failure (never a manufactured value) — the throw propagates
  // into the revalidate path, which the live-state cascade treats as stale-safe
  // (recompute skipped, prior ETag retained). This keeps the signature from ever
  // being built from a failed read and colliding across two different failures.
  const [headSha, mergeBase, statusZ] = await Promise.all([
    runGit(["rev-parse", "HEAD"], worktreePath),
    runGit(["merge-base", "main", "HEAD"], worktreePath),
    runGit(
      ["status", "--porcelain", "--no-renames", "--untracked-files=all", "-z"],
      worktreePath,
    ),
  ]);
  const entries = await Promise.all(
    parsePorcelainZ(statusZ).map((e) => statEntry(worktreePath, e)),
  );
  return editedFilesEtag(headSha, mergeBase.trim(), entries);
}
