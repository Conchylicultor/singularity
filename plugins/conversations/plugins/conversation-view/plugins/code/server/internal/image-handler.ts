import { resolve, sep } from "node:path";
import { getConversation } from "@plugins/tasks-core/server";

const GIT = "/usr/bin/git";
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_REFS = new Set(["HEAD", "main"]);

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

export const IMAGE_EXTS = new Set(Object.keys(EXT_TO_MIME));

export function extForPath(path: string): string {
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

async function resolveRef(worktreePath: string, ref: string): Promise<string> {
  if (ref !== "main") return ref;
  const proc = Bun.spawn(
    [GIT, "-C", worktreePath, "merge-base", "main", "HEAD"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return code === 0 ? out.trim() : ref;
}

export async function handleImageContent(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path || path.includes("\0"))
    return new Response("Invalid path", { status: 400 });

  const ref = url.searchParams.get("ref");

  const row = await getConversation(id);
  if (!row) return new Response("Not found", { status: 404 });

  const absRoot = resolve(row.worktreePath);
  const absTarget = resolve(absRoot, path);
  if (!isPathInside(absRoot, absTarget))
    return new Response("Invalid path", { status: 400 });

  const mime = mimeForPath(path);
  let bytes: Uint8Array;

  if (ref) {
    if (!ALLOWED_REFS.has(ref)) return new Response("Invalid ref", { status: 400 });
    const resolvedRef = await resolveRef(row.worktreePath, ref);
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
