import type { Stats } from "node:fs";
import { lstat, readlink, stat } from "node:fs/promises";
import type { HostFsEntry, HostFsEntryKind } from "../../core";
import { classifyFsError, isHiddenName } from "./path";

function kindOf(st: Stats): HostFsEntryKind {
  if (st.isDirectory()) return "dir";
  if (st.isFile()) return "file";
  return "other";
}

/**
 * Describe the entry at `path` (named `name`), judged by what it resolves to.
 * A symlink is followed: a link to a directory is a `dir`, to a file a `file`,
 * and its own text rides along as `symlinkTarget`. A link that cannot be
 * followed (dangling, a loop, a denied target) is a `symlink` described by the
 * link itself — a fact about the link, not a failure of the listing.
 *
 * Throws the raw `lstat` error for the entry itself, so each caller decides
 * what a vanished or unreadable entry means for its own answer.
 */
export async function describeEntry(
  path: string,
  name: string,
): Promise<HostFsEntry> {
  const own = await lstat(path);
  const hidden = isHiddenName(name);
  if (!own.isSymbolicLink()) {
    return {
      name,
      kind: kindOf(own),
      size: own.size,
      mtimeMs: own.mtimeMs,
      hidden,
    };
  }
  const symlinkTarget = await readlink(path);
  const target = await followLink(path);
  if (target.kind === "unresolvable") {
    return {
      name,
      kind: "symlink",
      size: own.size,
      mtimeMs: own.mtimeMs,
      hidden,
      symlinkTarget,
    };
  }
  const st = target.stats;
  return {
    name,
    kind: kindOf(st),
    size: st.size,
    mtimeMs: st.mtimeMs,
    hidden,
    symlinkTarget,
  };
}

/** What a symlink resolves to, or that it resolves to nothing readable. */
export type FollowResult =
  { kind: "resolved"; stats: Stats } | { kind: "unresolvable" };

export async function followLink(path: string): Promise<FollowResult> {
  try {
    return { kind: "resolved", stats: await stat(path) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ELOOP")
      return { kind: "unresolvable" };
    // missing / denied target → the link is unresolvable; anything else rethrows.
    classifyFsError(err);
    return { kind: "unresolvable" };
  }
}
