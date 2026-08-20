import { resolve, sep } from "node:path";

import { GIT, HOME_DIR } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// Every git read in this file serves an open HTTP request from the code
// explorer: a local, metadata-or-blob read that finishes in milliseconds. The
// request is the deadline, and thirty seconds is well past the point where an
// answer still helps whoever is looking at the pane — so only a wedged child
// reaches it, and it fails as a named error instead of holding the request open
// forever.
const GIT_TIMEOUT_MS = 30_000;
const MAX_BYTES = 2 * 1024 * 1024;

function expandTilde(path: string): string {
  if (path === "~") return HOME_DIR;
  if (path.startsWith("~/")) return resolve(HOME_DIR, path.slice(2));
  return path;
}

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

  const result = await spawnCaptured(
    [GIT, "--no-optional-locks", "-C", absRoot, "show", `${ref}:${relPath}`],
    { timeoutMs: GIT_TIMEOUT_MS },
  );
  if (result.exitCode !== 0) return { kind: "not-found" };
  // Raw bytes, not the utf8 decode: the size gate and the binary sniff below
  // are both statements about the file's bytes.
  const bytes = result.stdoutBytes;
  if (bytes.length > MAX_BYTES) return { kind: "too-large", size: bytes.length };
  if (looksBinary(bytes)) return { kind: "binary" };
  return { kind: "ok", content: new TextDecoder().decode(bytes) };
}

export async function getFileContent(
  worktreePath: string,
  relPath: string,
): Promise<FileReadResult> {
  if (!relPath || relPath.includes("\0")) return { kind: "invalid-path" };

  const expanded = expandTilde(relPath);
  const absRoot = resolve(worktreePath);
  const absTarget = expanded.startsWith("/") ? resolve(expanded) : resolve(absRoot, expanded);
  if (!expanded.startsWith("/") && !isPathInside(absRoot, absTarget)) return { kind: "invalid-path" };

  const file = Bun.file(absTarget);
  if (!(await file.exists())) return { kind: "not-found" };
  if (file.size > MAX_BYTES) return { kind: "too-large", size: file.size };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksBinary(bytes)) return { kind: "binary" };
  return { kind: "ok", content: new TextDecoder().decode(bytes) };
}
