import type { EditedFile, EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/shared";

const GIT = "/usr/bin/git";

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

export async function resolveParentSha(
  worktreePath: string,
  sha: string,
): Promise<string | null> {
  const out = await run(["rev-parse", `${sha}^`], worktreePath);
  if (out === null) return null;
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getRangeFiles(
  worktreePath: string,
  baseSha: string,
  headSha: string,
): Promise<EditedFile[] | null> {
  const byPath = new Map<string, FileEntry>();

  const nameStatus = await run(
    ["diff", "--no-renames", "--name-status", baseSha, headSha],
    worktreePath,
  );
  if (nameStatus === null) return null;

  for (const line of nameStatus.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const code = parts[0];
    const path = parts[parts.length - 1];
    if (!code || !path) continue;
    byPath.set(path, { status: mapDiffStatus(code), additions: 0, deletions: 0 });
  }

  const numstat = await run(
    ["diff", "--no-renames", "--numstat", baseSha, headSha],
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

  return [...byPath.entries()]
    .map(([path, entry]) => ({
      path,
      status: entry.status,
      additions: entry.additions,
      deletions: entry.deletions,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
