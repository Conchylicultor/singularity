import { resolve, sep } from "node:path";
import type { EditedFile, EditedFileStatus } from "../../shared/protocol";

const GIT = "/usr/bin/git";
const UNTRACKED_MAX_BYTES = 2 * 1024 * 1024;

interface FileEntry {
  status: EditedFileStatus;
  additions: number;
  deletions: number;
}

async function run(args: string[], cwd: string): Promise<string | null> {
  const proc = Bun.spawn([GIT, "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) return null;
  return out;
}

function mapDiffStatus(code: string): EditedFileStatus {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  return "modified";
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

export async function getEditedFiles(worktreePath: string): Promise<EditedFile[]> {
  const byPath = new Map<string, FileEntry>();

  const diff = await run(
    ["diff", "--no-renames", "--name-status", "main...HEAD"],
    worktreePath,
  );
  if (diff) {
    for (const line of diff.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      if (parts.length < 2) continue;
      const code = parts[0];
      const path = parts[parts.length - 1];
      ensureEntry(byPath, path, mapDiffStatus(code));
    }
  }

  const status = await run(["status", "--porcelain", "--untracked-files=all"], worktreePath);
  if (status) {
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
  }

  // Per-file +/- counts: tracked files via numstat against main (covers both
  // committed branch changes and uncommitted working-tree edits).
  const numstat = await run(
    ["diff", "--no-renames", "--numstat", "main"],
    worktreePath,
  );
  if (numstat) {
    for (const line of numstat.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const [addStr, delStr, path] = parts;
      const entry = byPath.get(path);
      if (!entry) continue;
      entry.additions = addStr === "-" ? 0 : Number.parseInt(addStr, 10) || 0;
      entry.deletions = delStr === "-" ? 0 : Number.parseInt(delStr, 10) || 0;
    }
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
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
