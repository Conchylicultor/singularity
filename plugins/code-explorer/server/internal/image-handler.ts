import { resolve, sep } from "node:path";
import { GIT, HOME_DIR } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { ALLOWED_REFS, resolveRef } from "./resolve-ref";
import { resolveWorktreePath } from "./resolve-worktree-path";

// Every git read in this file serves an open HTTP request from the code
// explorer: a local, metadata-or-blob read that finishes in milliseconds. The
// request is the deadline, and thirty seconds is well past the point where an
// answer still helps whoever is looking at the pane — so only a wedged child
// reaches it, and it fails as a named error instead of holding the request open
// forever.
const GIT_TIMEOUT_MS = 30_000;
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
  if (path === "~") return HOME_DIR;
  if (path.startsWith("~/")) return resolve(HOME_DIR, path.slice(2));
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
  let bytes: Uint8Array<ArrayBuffer>;

  if (ref) {
    const absTarget = resolve(absRoot, path);
    if (
      path.startsWith("/") ||
      path.startsWith("~") ||
      !isPathInside(absRoot, absTarget)
    )
      return new Response("Invalid path", { status: 400 });
    if (!ALLOWED_REFS.has(ref))
      return new Response("Invalid ref", { status: 400 });
    const resolvedRef = await resolveRef(wtPath, ref);
    const result = await spawnCaptured(
      [
        GIT,
        "--no-optional-locks",
        "-C",
        absRoot,
        "show",
        `${resolvedRef}:${path}`,
      ],
      { timeoutMs: GIT_TIMEOUT_MS },
    );
    if (result.exitCode !== 0)
      return new Response("File not found", { status: 404 });
    bytes = new Uint8Array(result.stdoutBytes);
  } else {
    const expanded = expandTilde(path);
    const absTarget = expanded.startsWith("/")
      ? resolve(expanded)
      : resolve(absRoot, expanded);
    if (!expanded.startsWith("/") && !isPathInside(absRoot, absTarget))
      return new Response("Invalid path", { status: 400 });
    const file = Bun.file(absTarget);
    if (!(await file.exists()))
      return new Response("File not found", { status: 404 });
    if (file.size > MAX_BYTES)
      return new Response("File too large", { status: 413 });
    bytes = new Uint8Array(await file.arrayBuffer());
  }

  if (bytes.length > MAX_BYTES)
    return new Response("File too large", { status: 413 });

  return new Response(bytes, {
    headers: { "Content-Type": mime, "Cache-Control": "no-cache" },
  });
}
