import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { GIT } from "@plugins/infra/plugins/paths/server";
import { ALLOWED_REFS, resolveRef } from "./resolve-ref";
import { resolveWorktreePath } from "./resolve-worktree-path";
const MAX_BYTES = 20 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
};

function extForPath(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1);
}

function mimeForPath(path: string): string | null {
  return EXT_TO_MIME[extForPath(path)] ?? null;
}

function isPathInside(root: string, target: string): boolean {
  const rootNorm = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(rootNorm);
}

function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return path;
}

export async function handleImageContent(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const worktree = params.worktree;
  if (!worktree) return new Response("Missing worktree", { status: 400 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path || path.includes("\0"))
    return new Response("Invalid path", { status: 400 });

  const ref = url.searchParams.get("ref");

  const wtPath = await resolveWorktreePath(worktree);
  if (!wtPath) return new Response("Not found", { status: 404 });

  const mime = mimeForPath(path);
  if (!mime) return new Response("Unsupported media type", { status: 415 });

  const absRoot = resolve(wtPath);
  let bytes: Uint8Array;

  if (ref) {
    const absTarget = resolve(absRoot, path);
    if (path.startsWith("/") || path.startsWith("~") || !isPathInside(absRoot, absTarget))
      return new Response("Invalid path", { status: 400 });
    if (!ALLOWED_REFS.has(ref)) return new Response("Invalid ref", { status: 400 });
    const resolvedRef = await resolveRef(wtPath, ref);
    const proc = Bun.spawn(
      [GIT, "-C", absRoot, "show", `${resolvedRef}:${path}`],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [buf, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      proc.exited,
    ]);
    if (code !== 0) return new Response("File not found", { status: 404 });
    bytes = new Uint8Array(buf);
  } else {
    const expanded = expandTilde(path);
    const absTarget = expanded.startsWith("/")
      ? resolve(expanded)
      : resolve(absRoot, expanded);
    if (!expanded.startsWith("/") && !isPathInside(absRoot, absTarget))
      return new Response("Invalid path", { status: 400 });
    const file = Bun.file(absTarget);
    if (!(await file.exists())) return new Response("File not found", { status: 404 });
    if (file.size > MAX_BYTES)
      return new Response("File too large", { status: 413 });
    bytes = new Uint8Array(await file.arrayBuffer());
  }

  if (bytes.length > MAX_BYTES) return new Response("File too large", { status: 413 });

  return new Response(bytes, {
    headers: { "Content-Type": mime, "Cache-Control": "no-cache" },
  });
}
