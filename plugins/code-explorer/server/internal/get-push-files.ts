import type { EditedFile, EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { parseDiffNameStatusZ, parseDiffNumstatZ } from "./parse-diff-z";
import { tryRunGit } from "@plugins/primitives/plugins/commit-list/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";

interface FileEntry {
  status: EditedFileStatus;
  additions: number;
  deletions: number;
  from?: string;
}

export async function resolveParentSha(
  worktreePath: string,
  sha: string,
): Promise<string | null> {
  // `rev-parse <sha>^` exits non-zero for a root commit (no parent) — a legit
  // "no parent" answer (→ null), so this is a probe. Callers branch on null to
  // mean "no resolvable base".
  const res = await tryRunGit(["rev-parse", `${sha}^`], worktreePath);
  if (!res.ok) return null;
  const trimmed = res.stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getRangeFiles(
  worktreePath: string,
  baseSha: string,
  headSha: string,
): Promise<EditedFile[] | null> {
  return withHeavyReadSlot(async () => {
    const byPath = new Map<string, FileEntry>();

    // Both diffs signal failure the same way — a null return the callers map to
    // HttpError(500). numstat previously used an `if (numstat)` truthiness guard
    // that silently zeroed +/- counts on a git failure; it now fails identically
    // to nameStatus so a failed read is never absorbed as "0 additions/deletions".
    const nameStatus = await tryRunGit(
      ["diff", "-M", "-C", "-z", "--name-status", baseSha, headSha],
      worktreePath,
    );
    if (!nameStatus.ok) return null;

    for (const rec of parseDiffNameStatusZ(nameStatus.stdout)) {
      byPath.set(rec.path, {
        status: rec.status,
        additions: 0,
        deletions: 0,
        ...(rec.from ? { from: rec.from } : {}),
      });
    }

    const numstat = await tryRunGit(
      ["diff", "-M", "-C", "-z", "--numstat", baseSha, headSha],
      worktreePath,
    );
    if (!numstat.ok) return null;

    for (const rec of parseDiffNumstatZ(numstat.stdout)) {
      const entry = byPath.get(rec.path);
      if (!entry) continue;
      entry.additions = rec.additions;
      entry.deletions = rec.deletions;
    }

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
