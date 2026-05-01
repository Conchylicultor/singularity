import { resolve, sep } from "node:path";

import { GIT } from "@plugins/infra/plugins/paths/server";
const MAX_BYTES = 2 * 1024 * 1024;

export type FileReadResult =
  | { kind: "ok"; content: string }
  | { kind: "invalid-path" }
  | { kind: "not-found" }
  | { kind: "too-large"; size: number }
  | { kind: "binary" };

function isPathInside(root: string, target: string): boolean {
  const rootNorm = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(rootNorm);
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8000));
  for (const b of sample) {
    if (b === 0) return true;
  }
  return false;
}

export async function getFileContentAtRef(
  worktreePath: string,
  relPath: string,
  ref: string,
): Promise<FileReadResult> {
  if (!relPath || relPath.includes("\0")) return { kind: "invalid-path" };

  const absRoot = resolve(worktreePath);
  const absTarget = resolve(absRoot, relPath);
  if (!isPathInside(absRoot, absTarget)) return { kind: "invalid-path" };

  const proc = Bun.spawn([GIT, "-C", absRoot, "show", `${ref}:${relPath}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [bytes, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer().then((b) => new Uint8Array(b)),
    proc.exited,
  ]);
  if (code !== 0) return { kind: "not-found" };
  if (bytes.length > MAX_BYTES) return { kind: "too-large", size: bytes.length };
  if (looksBinary(bytes)) return { kind: "binary" };
  return { kind: "ok", content: new TextDecoder().decode(bytes) };
}

export async function getFileContent(
  worktreePath: string,
  relPath: string,
): Promise<FileReadResult> {
  if (!relPath || relPath.includes("\0")) return { kind: "invalid-path" };

  const absRoot = resolve(worktreePath);
  const absTarget = resolve(absRoot, relPath);
  if (!isPathInside(absRoot, absTarget)) return { kind: "invalid-path" };

  const file = Bun.file(absTarget);
  if (!(await file.exists())) return { kind: "not-found" };
  if (file.size > MAX_BYTES) return { kind: "too-large", size: file.size };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksBinary(bytes)) return { kind: "binary" };
  return { kind: "ok", content: new TextDecoder().decode(bytes) };
}
