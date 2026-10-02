import { useMemo } from "react";
import type { FileRef } from "../../core";

/**
 * The same `FileRef` object for as long as it names the same file. Hosts build
 * the ref inline (`{ source: "git", worktree, path }`), a fresh object every
 * render; anything memoized on it would recompute every render too.
 */
export function useStableFileRef(file: FileRef): FileRef {
  const { source, path } = file;
  const worktree = file.source === "git" ? file.worktree : "";
  const ref = file.source === "git" ? file.ref : undefined;
  return useMemo<FileRef>(
    () =>
      source === "host"
        ? { source, path }
        : { source, worktree, path, ...(ref !== undefined ? { ref } : {}) },
    [source, path, worktree, ref],
  );
}
