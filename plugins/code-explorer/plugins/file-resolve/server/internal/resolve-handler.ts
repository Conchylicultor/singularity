import { resolve } from "node:path";
import { resolveWorktreePath } from "@plugins/code-explorer/server";
import { GIT, HOME_DIR } from "@plugins/infra/plugins/paths/server";

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

export async function handleResolve(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const worktree = params.worktree;
  if (!worktree) return new Response("Missing worktree", { status: 400 });

  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath || rawPath.includes("\0"))
    return Response.json({ kind: "not-found" });

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) return new Response("Not found", { status: 404 });

  const cleaned = expandTilde(rawPath.replace(/^\.\//, ""));
  if (!cleaned) return Response.json({ kind: "not-found" });

  const absTarget = cleaned.startsWith("/") ? resolve(cleaned) : resolve(wtPath, cleaned);
  if (await Bun.file(absTarget).exists()) {
    return Response.json({ kind: "exact" });
  }

  // ~-rooted and absolute paths are not in the git tree; skip ls-files
  if (cleaned.startsWith("/")) return Response.json({ kind: "not-found" });

  const proc = Bun.spawn(
    [GIT, "--no-optional-locks", "-C", wtPath, "ls-files", "--cached", "--others", "--exclude-standard"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) return Response.json({ kind: "not-found" });

  const querySeg = cleaned.split("/");
  const matches: string[] = [];

  for (const line of out.split("\n")) {
    if (!line) continue;
    const fileSeg = line.split("/");
    if (isSubsequence(querySeg, fileSeg)) {
      matches.push(line);
    }
  }

  if (matches.length === 0) return Response.json({ kind: "not-found" });

  const suffix: string[] = [];
  const rest: string[] = [];
  for (const m of matches) {
    if (isSuffixMatch(querySeg, m.split("/"))) suffix.push(m);
    else rest.push(m);
  }

  if (suffix.length === 1) {
    return Response.json({ kind: "resolved", matches: suffix });
  }

  const sorted = [
    ...suffix.sort((a, b) => a.length - b.length),
    ...rest.sort((a, b) => a.length - b.length),
  ];
  return Response.json({ kind: "resolved", matches: sorted });
}
