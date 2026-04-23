import { resolve, sep } from "node:path";
import { ALLOWED_REFS, resolveRef } from "./resolve-ref";
import { resolveWorktreePath } from "./resolve-worktree-path";

const GIT = "/usr/bin/git";
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

function mimeForPath(path: string): string {
  return EXT_TO_MIME[extForPath(path)] ?? "application/octet-stream";
}

function isPathInside(root: string, target: string): boolean {
  const rootNorm = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(rootNorm);
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

  const absRoot = resolve(wtPath);
  const absTarget = resolve(absRoot, path);
  if (!isPathInside(absRoot, absTarget))
    return new Response("Invalid path", { status: 400 });

  const mime = mimeForPath(path);
  let bytes: Uint8Array;

  if (ref) {
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
