import type { EditedFile, EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { parseDiffNameStatusZ, parseDiffNumstatZ } from "./parse-diff-z";
import { runGit } from "@plugins/primitives/plugins/commit-list/server";
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
  const out = await runGit(["rev-parse", `${sha}^`], worktreePath);
  if (out === null) return null;
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getRangeFiles(
  worktreePath: string,
  baseSha: string,
  headSha: string,
): Promise<EditedFile[] | null> {
  return withHeavyReadSlot(async () => {
    const byPath = new Map<string, FileEntry>();

    const nameStatus = await runGit(
      ["diff", "-M", "-C", "-z", "--name-status", baseSha, headSha],
      worktreePath,
    );
    if (nameStatus === null) return null;

    for (const rec of parseDiffNameStatusZ(nameStatus)) {
      byPath.set(rec.path, {
        status: rec.status,
        additions: 0,
        deletions: 0,
        ...(rec.from ? { from: rec.from } : {}),
      });
    }

    const numstat = await runGit(
      ["diff", "-M", "-C", "-z", "--numstat", baseSha, headSha],
      worktreePath,
    );
    if (numstat) {
      for (const rec of parseDiffNumstatZ(numstat)) {
        const entry = byPath.get(rec.path);
        if (!entry) continue;
        entry.additions = rec.additions;
        entry.deletions = rec.deletions;
      }
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
