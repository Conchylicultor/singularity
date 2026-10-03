import { resolve } from "node:path";

import { GIT } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { HOST_FS_TEXT_MAX_BYTES } from "@plugins/infra/plugins/host-fs/core";
import { decodeTextBytes } from "@plugins/infra/plugins/host-fs/server";
import { resolveInsideRoot } from "./contained-path";

// Every git read in this file serves an open HTTP request from the code
// explorer: a local, metadata-or-blob read that finishes in milliseconds. The
// request is the deadline, and thirty seconds is well past the point where an
// answer still helps whoever is looking at the pane — so only a wedged child
// reaches it, and it fails as a named error instead of holding the request open
// forever.
const GIT_TIMEOUT_MS = 30_000;

export type FileReadResult =
  | { kind: "ok"; content: string }
  | { kind: "invalid-path" }
  | { kind: "not-found" }
  | { kind: "too-large"; size: number }
  | { kind: "binary" };

export async function getFileContentAtRef(
  worktreePath: string,
  relPath: string,
  ref: string,
): Promise<FileReadResult> {
  if (resolveInsideRoot(worktreePath, relPath) === null)
    return { kind: "invalid-path" };
  const absRoot = resolve(worktreePath);

  const result = await spawnCaptured(
    [GIT, "--no-optional-locks", "-C", absRoot, "show", `${ref}:${relPath}`],
    { timeoutMs: GIT_TIMEOUT_MS },
  );
  if (result.exitCode !== 0) return { kind: "not-found" };
  // Raw bytes, not the utf8 decode: the size gate and the binary sniff are
  // both statements about the file's bytes.
  return decodeTextBytes(result.stdoutBytes);
}

export async function getFileContent(
  worktreePath: string,
  relPath: string,
): Promise<FileReadResult> {
  // The file as it is on disk right now — inside the checkout only. A file
  // elsewhere on the host is host-fs's to read (file-viewer's `host` FileRef).
  const absTarget = resolveInsideRoot(worktreePath, relPath);
  if (absTarget === null) return { kind: "invalid-path" };

  const file = Bun.file(absTarget);
  if (!(await file.exists())) return { kind: "not-found" };
  if (file.size > HOST_FS_TEXT_MAX_BYTES)
    return { kind: "too-large", size: file.size };
  return decodeTextBytes(new Uint8Array(await file.arrayBuffer()));
}
