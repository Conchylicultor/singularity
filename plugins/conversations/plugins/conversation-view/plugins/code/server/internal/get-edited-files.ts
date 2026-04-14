import type { EditedFile, EditedFileStatus } from "../../shared/protocol";

const GIT = "/usr/bin/git";

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

export async function getEditedFiles(worktreePath: string): Promise<EditedFile[]> {
  const byPath = new Map<string, EditedFileStatus>();

  const diff = await run(["diff", "--name-status", "main...HEAD"], worktreePath);
  if (diff) {
    for (const line of diff.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      if (parts.length < 2) continue;
      const code = parts[0];
      const path = parts[parts.length - 1];
      byPath.set(path, mapDiffStatus(code));
    }
  }

  const status = await run(["status", "--porcelain", "--untracked-files=all"], worktreePath);
  if (status) {
    for (const line of status.split("\n")) {
      if (!line) continue;
      const code = line.slice(0, 2);
      const path = line.slice(3);
      if (code === "??") {
        if (!byPath.has(path)) byPath.set(path, "untracked");
      } else if (code.includes("D")) {
        byPath.set(path, "deleted");
      } else if (code.includes("A")) {
        if (!byPath.has(path)) byPath.set(path, "added");
      } else {
        if (!byPath.has(path)) byPath.set(path, "modified");
      }
    }
  }

  return [...byPath.entries()]
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
