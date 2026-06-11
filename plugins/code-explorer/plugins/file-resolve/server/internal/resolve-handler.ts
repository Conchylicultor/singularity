import { resolve } from "node:path";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resolveWorktreePath } from "@plugins/code-explorer/server";
import { GIT, HOME_DIR } from "@plugins/infra/plugins/paths/server";
import { resolveFile } from "../../shared/endpoints";

function expandTilde(path: string): string {
  if (path === "~") return HOME_DIR;
  if (path.startsWith("~/")) return resolve(HOME_DIR, path.slice(2));
  return path;
}

function isSubsequence(query: string[], file: string[]): boolean {
  let qi = 0;
  for (let fi = 0; fi < file.length && qi < query.length; fi++) {
    if (file[fi] === query[qi]) qi++;
  }
  return qi === query.length;
}

function isSuffixMatch(query: string[], file: string[]): boolean {
  if (query.length > file.length) return false;
  const offset = file.length - query.length;
  for (let i = 0; i < query.length; i++) {
    if (file[offset + i] !== query[i]) return false;
  }
  return true;
}

export const handleResolve = implement(resolveFile, async ({ params, query }) => {
  const { worktree } = params;
  if (!worktree) throw new HttpError(400, "Missing worktree");

  const rawPath = query.path;
  if (!rawPath || rawPath.includes("\0"))
    return { kind: "not-found" as const };

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) throw new HttpError(404, "Not found");

  const cleaned = expandTilde(rawPath.replace(/^\.\//, ""));
  if (!cleaned) return { kind: "not-found" as const };

  const absTarget = cleaned.startsWith("/") ? resolve(cleaned) : resolve(wtPath, cleaned);
  if (await Bun.file(absTarget).exists()) {
    return { kind: "exact" as const };
  }

  // ~-rooted and absolute paths are not in the git tree; skip ls-files
  if (cleaned.startsWith("/")) return { kind: "not-found" as const };

  const proc = Bun.spawn(
    [GIT, "--no-optional-locks", "-C", wtPath, "ls-files", "--cached", "--others", "--exclude-standard"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) return { kind: "not-found" as const };

  const querySeg = cleaned.split("/").filter((s) => s !== "...");
  const matches: string[] = [];

  for (const line of out.split("\n")) {
    if (!line) continue;
    const fileSeg = line.split("/");
    if (isSubsequence(querySeg, fileSeg)) {
      matches.push(line);
    }
  }

  if (matches.length === 0) return { kind: "not-found" as const };

  const suffix: string[] = [];
  const rest: string[] = [];
  for (const m of matches) {
    if (isSuffixMatch(querySeg, m.split("/"))) suffix.push(m);
    else rest.push(m);
  }

  if (suffix.length === 1) {
    return { kind: "resolved" as const, matches: suffix };
  }

  const sorted = [
    ...suffix.sort((a, b) => a.length - b.length),
    ...rest.sort((a, b) => a.length - b.length),
  ];
  return { kind: "resolved" as const, matches: sorted };
});
