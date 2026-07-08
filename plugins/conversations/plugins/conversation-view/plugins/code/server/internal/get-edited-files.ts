import { resolve, sep } from "node:path";
import type { EditedFile, EditedFileStatus } from "../../core/protocol";
import { parseDiffNameStatusZ, parseDiffNumstatZ } from "./parse-diff-z";
import { runGit } from "@plugins/primitives/plugins/commit-list/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";
import { currentGeneration, editedFilesMemo } from "./edited-files-cache";

const UNTRACKED_MAX_BYTES = 2 * 1024 * 1024;

interface FileEntry {
  status: EditedFileStatus;
  additions: number;
  deletions: number;
  from?: string;
}

function isPathInside(root: string, target: string): boolean {
  const rootNorm = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(rootNorm);
}

async function countUntrackedLines(
  worktreePath: string,
  relPath: string,
): Promise<number> {
  const absRoot = resolve(worktreePath);
  const absTarget = resolve(absRoot, relPath);
  if (!isPathInside(absRoot, absTarget)) return 0;
  const file = Bun.file(absTarget);
  if (!(await file.exists())) return 0;
  if (file.size > UNTRACKED_MAX_BYTES) return 0;
  const buf = new Uint8Array(await file.arrayBuffer());
  for (let i = 0; i < Math.min(buf.length, 8192); i++) {
    if (buf[i] === 0) return 0;
  }
  if (buf.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) lines++;
  }
  if (buf[buf.length - 1] !== 0x0a) lines++;
  return lines;
}

function ensureEntry(
  byPath: Map<string, FileEntry>,
  path: string,
  status: EditedFileStatus,
): FileEntry {
  let entry = byPath.get(path);
  if (!entry) {
    entry = { status, additions: 0, deletions: 0 };
    byPath.set(path, entry);
  }
  return entry;
}

// The READ path. The @parcel watcher (watch-edited-files.ts) is the authoritative
// WRITER: it computes the files directly and write-throughs them at a bumped
// generation. `getEditedFiles` reads through the shared memo with the current
// generation as the cheap, ungated signature:
//   - HIT (no watcher recompute since the cached value): returns the watcher's
//     latest list with NO git spawn and NO heavy slot — e.g. a fresh conversation
//     subscribing to an already-watched worktree.
//   - MISS (cold — generation 0 with no cache, or the watcher advanced past the
//     cached generation): computes once via the memo's embedded per-worktree
//     single-flight, collapsing with openRoom's compute if concurrent.
// The signature is a generation counter (NOT git state) because an uncommitted
// save changes the working-tree diff without moving any SHA — a SHA signature
// would serve stale data. See research/2026-06-19-global-incremental-git-loaders.md.
//
// Concurrent identical reads still collapse onto one git-status batch via the
// memo's embedded inflight: the edited-files loader and the plugin-changes
// endpoint both call this for the same worktree, often at the same instant during
// a review. See research/2026-06-15-global-live-state-cascade-contention.md
// (Change 5) and research/2026-06-16-global-host-wide-cpu-admission-flock-broker.md.
export function getEditedFiles(worktreePath: string): Promise<EditedFile[]> {
  return editedFilesMemo.get(
    worktreePath,
    () => Promise.resolve(String(currentGeneration(worktreePath))),
    () => computeEditedFiles(worktreePath),
  );
}

// The un-memoized, gated compute. The watcher calls this DIRECTLY (then primes the
// memo) so it never reads its own cache; the loader reaches it only on a memo miss.
export async function computeEditedFiles(
  worktreePath: string,
): Promise<EditedFile[]> {
  return withHeavyReadSlot(async () => {
    const byPath = new Map<string, FileEntry>();

    // A git failure here must NOT be conflated with "no merge-base" — a manufactured
    // "main" fallback (or an empty diff below) would publish a false-empty edited-files
    // list that a destructive "Drop & Close" then acts on. runGit throws on failure;
    // the throw propagates to the resource loader (stale-safe: the live-state cascade
    // skips the push and keeps the last-known-good).
    const mergeBase = (await runGit(["merge-base", "main", "HEAD"], worktreePath)).trim();

    // -M / -C enable rename/copy detection; -z disambiguates the from/to pair.
    const diff = await runGit(
      ["diff", "-M", "-C", "-z", "--name-status", mergeBase],
      worktreePath,
    );
    for (const rec of parseDiffNameStatusZ(diff)) {
      const entry = ensureEntry(byPath, rec.path, rec.status);
      if (rec.from) entry.from = rec.from;
    }

    // Working-tree changes are layered on top of the branch diff. We pass
    // --no-renames here because porcelain-v1 rename output is awkward to parse
    // and uncommitted renames are rare; they degrade to add+delete.
    const status = await runGit(
      ["status", "--porcelain", "--no-renames", "--untracked-files=all"],
      worktreePath,
    );
    for (const line of status.split("\n")) {
      if (!line) continue;
      const code = line.slice(0, 2);
      const path = line.slice(3);
      if (code === "??") {
        ensureEntry(byPath, path, "untracked");
      } else if (code.includes("D")) {
        const entry = ensureEntry(byPath, path, "deleted");
        entry.status = "deleted";
      } else if (code.includes("A")) {
        ensureEntry(byPath, path, "added");
      } else {
        ensureEntry(byPath, path, "modified");
      }
    }

    // Per-file +/- counts: tracked files via numstat against the merge-base (covers
    // both committed branch changes and uncommitted working-tree edits).
    const numstat = await runGit(
      ["diff", "-M", "-C", "-z", "--numstat", mergeBase],
      worktreePath,
    );
    for (const rec of parseDiffNumstatZ(numstat)) {
      const entry = byPath.get(rec.path);
      if (!entry) continue;
      entry.additions = rec.additions;
      entry.deletions = rec.deletions;
    }

    // Untracked files don't appear in numstat — count their lines as additions.
    await Promise.all(
      [...byPath.entries()].map(async ([path, entry]) => {
        if (entry.status !== "untracked") return;
        entry.additions = await countUntrackedLines(worktreePath, path);
      }),
    );

    return [...byPath.entries()]
      .map(([path, entry]) => ({
        path,
        status: entry.status,
        additions: entry.additions,
        deletions: entry.deletions,
        ...(entry.from ? { from: entry.from } : {}),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  });
}
